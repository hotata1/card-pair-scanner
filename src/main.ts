/**
 * 本番エントリ: 1画面アプリ(business-logic-model.md の起動シーケンス準拠)。
 * 開発ハーネスは harness.html(src/harness-main.ts)に分離されている。
 */
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { CognitoAuth } from './auth/cognito-auth';
import { CaptureController } from './services/capture-controller';
import { RecognitionService, type FrameOutcome } from './services/recognition-service';
import { CameraSource } from './sources/camera';
import { SimulatorSource } from './sources/simulator-source';
import type { VideoSource } from './sources/types';
import { RecordStore, type PairRecord } from './state/record-store';
import { SettingsStore, type Settings } from './state/settings-store';
import { AwsRecognizer } from './vision/aws/recognizer';
import { CameraView } from './ui/camera-view';
import { confirmDialog } from './ui/confirm-dialog';
import { ControlBar } from './ui/control-bar';
import { editDialog } from './ui/edit-dialog';
import { FoundBar } from './ui/found-bar';
import { renderLoginGate } from './ui/login-gate';
import { ResultsPanel } from './ui/results-panel';
import { SearchBar } from './ui/search-bar';
import { SettingsPanel } from './ui/settings-panel';
import { StatusBar } from './ui/status-bar';
import { EngineRegistry } from './vision/registry';
import { createCanvasRasterizer } from './vision/template/rasterize';
import { TemplateRecognizer } from './vision/template/recognizer';
import { TesseractRecognizer } from './vision/tesseract/recognizer';

// 番号検索中の撮影間隔。AWSエンジンはRekognition呼び出しごとに課金されるため1〜2秒に1回へ抑える。
const SEARCH_INTERVAL_MS = 1500;
// 検索の自動停止までの時間。止め忘れ放置による想定外課金を防ぐコスト保護(US要望)。
const SEARCH_TIMEOUT_MS = 180000; // 3分

async function bootstrap(): Promise<void> {
  const app = document.getElementById('app')!;

  // 0. ログインゲート(入口で堰き止め)。ドメイン/クライアントID未設定ならローカル開発用に無効化。
  const auth = new CognitoAuth({
    domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
    clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  });
  if (auth.configured) {
    await auth.handleRedirectCallback();
    const token = await auth.getValidAccessToken();
    if (!token) {
      renderLoginGate(app, () => void auth.login());
      return;
    }
  }

  // 1. 設定復元
  const settingsStore = new SettingsStore();

  // 2. 記録ロード
  const recordStore = new RecordStore();

  // 認識基盤
  const registry = new EngineRegistry();
  registry.register(new TemplateRecognizer(createCanvasRasterizer()));
  registry.register(new TesseractRecognizer());
  const awsEndpoint = import.meta.env.VITE_AWS_RECOGNIZE_URL;
  const awsAvailable = Boolean(awsEndpoint && auth.configured);
  if (awsAvailable) {
    registry.register(new AwsRecognizer(awsEndpoint!, () => auth.getValidAccessToken()));
  }
  // 前回awsを選んでいても今回未提供なら未登録エラーを避けて標準エンジンへ戻す
  if (!awsAvailable && settingsStore.get().engine === 'aws') settingsStore.save({ engine: 'template' });

  const service = new RecognitionService(registry, recordStore, settingsStore.get().confidenceThreshold);

  // UI構築
  const cameraView = new CameraView();
  const statusBar = new StatusBar();
  const appVersion = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const settingsPanel = new SettingsPanel(
    {
      onChange: (patch) => settingsStore.save(patch),
      onClearAll: () => recordStore.clear(),
      getRecordCount: () => recordStore.size,
      onLogout: auth.configured ? () => auth.logout() : undefined,
    },
    appVersion,
    { awsAvailable },
  );
  const resultsPanel = new ResultsPanel({
    onEdit: (record: PairRecord) => {
      void editDialog(record, (v) => recordStore.update(record.id, v.letter, v.digits));
    },
    onDelete: (record: PairRecord) => {
      void (async () => {
        const ok = await confirmDialog('削除', `${record.letter}-${record.digits} を削除しますか?`, '削除する');
        if (ok) await recordStore.remove(record.id);
      })();
    },
  });
  const foundBar = new FoundBar();
  const controlBar = new ControlBar({
    // 繰り返しスキャン用: 記録した組と検索結果を一括で消して次の回に備える
    onReset: () => {
      void (async () => {
        const count = recordStore.size;
        if (count === 0) {
          foundBar.clear();
          return;
        }
        const ok = await confirmDialog('リセット', `記録した ${count}件 をすべて消して、次のスキャンを始めますか?`, 'リセットする');
        if (!ok) return;
        await recordStore.clear();
        foundBar.clear();
      })();
    },
    // シャッター1回 = 8枚/4秒の連写(点滅する数字を周期をまたいで捕捉する)
    onShutter: () => {
      try {
        // タップが処理された瞬間に必ず表示を変える(押下自体の生存確認)
        controlBar.setShutterProgress('0/8');
        navigator.vibrate?.(50); // Androidでは押下を振動で通知(iOSは非対応)
        void controller
          .captureBurst(8, 4000, (done, total) => controlBar.setShutterProgress(`${done}/${total}`))
          .catch((err) => statusBar.showError(`連写失敗: ${err instanceof Error ? err.message : String(err)}`))
          .finally(() => controlBar.setShutterProgress(null));
      } catch (err) {
        statusBar.showError(`シャッター処理失敗: ${err instanceof Error ? err.message : String(err)}`);
        controlBar.setShutterProgress(null);
      }
    },
    onSettings: () => settingsPanel.open(settingsStore.get()),
  });

  // 番号検索: 最大5件を同時に指定し、見つかるまで自動撮影を継続する
  let activeTargets = new Set<string>();
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  // 検索の後始末を1箇所に集約(ボタン停止・全件発見・タイムアウトのいずれからも呼ぶ)
  function endSearch(): void {
    if (searchTimer !== null) {
      clearTimeout(searchTimer);
      searchTimer = null;
    }
    activeTargets = new Set();
    controller.stopAuto();
    controller.setInterval(settingsStore.get().intervalMs); // 検索中の変更があってもここで最新値に戻す
    controlBar.setSearchLock(false);
    searchBar.setSearching(false);
  }
  const searchBar = new SearchBar({
    onStart: (targets) => {
      activeTargets = new Set(targets);
      controller.setInterval(SEARCH_INTERVAL_MS);
      controlBar.setSearchLock(true);
      controller.startAuto();
      // コスト保護: 一定時間見つからなければ自動停止(止め忘れ放置対策)
      if (searchTimer !== null) clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        endSearch();
        statusBar.showNotice(`${SEARCH_TIMEOUT_MS / 60000}分間見つからなかったため検索を自動停止しました`, 8000);
      }, SEARCH_TIMEOUT_MS);
    },
    onStop: () => endSearch(),
  });

  app.replaceChildren(
    cameraView.root,
    statusBar.root,
    searchBar.root,
    controlBar.root,
    foundBar.root,
    resultsPanel.root,
  );

  // 撮影制御
  const onOutcome = (outcome: FrameOutcome): void => {
    cameraView.renderOverlay(outcome);
    // BR-U2-7拡張: 検出0枚も含め毎撮影後に必ずフィードバックを出す
    statusBar.setFrameFeedback(outcome.cardCount, outcome.lowConfidence.length, outcome.added.length);

    if (activeTargets.size > 0) {
      for (const c of outcome.accepted) {
        if (!activeTargets.has(c.digits)) continue;
        activeTargets.delete(c.digits);
        foundBar.add(c.letter, c.digits);
        searchBar.markFound(c.digits); // 全件見つかれば内部で検索終了(onStop)を呼ぶ
        navigator.vibrate?.([60, 40, 60]);
      }
      if (activeTargets.size > 0 && outcome.lowConfidence.some((c) => activeTargets.has(c.digits))) {
        statusBar.showNotice('対象の番号を検出しました。文字が読み取れるまでそのまま構えてください', 2000);
      }
    }
  };
  const controller = new CaptureController(
    () => cameraView.grabFrame(),
    service,
    settingsStore.get().intervalMs,
    onOutcome,
    // フレーム処理の失敗を無言にしない: 画面に理由を出す(実機診断用)
    (err) => {
      console.error('frame failed:', err);
      statusBar.showError(`処理エラー: ${err instanceof Error ? err.message : String(err)}`);
    },
  );

  // 想定外の例外・Promise拒否もすべて画面に出す(実機にコンソールがないため)
  window.addEventListener('error', (ev) => statusBar.showError(`エラー: ${ev.message}`));
  window.addEventListener('unhandledrejection', (ev) => {
    const r = (ev as PromiseRejectionEvent).reason;
    statusBar.showError(`エラー: ${r instanceof Error ? r.message : String(r)}`);
  });

  // 記録購読 → 一覧・件数
  recordStore.onChange((records) => {
    resultsPanel.render(records);
    statusBar.setRecordCount(records.length);
  });
  await recordStore.init();
  if (!recordStore.storageAvailable) {
    statusBar.showNotice('この端末では記録が保存されません(ブラウザの設定をご確認ください)', 15000);
  }

  // 3. 映像ソース起動(切替対応)
  let source: VideoSource | null = null;
  const startSource = async (kind: Settings['source']): Promise<void> => {
    source?.stop();
    cameraView.detachSource();
    source = kind === 'camera' ? new CameraSource() : new SimulatorSource();
    try {
      await source.start();
      cameraView.attachSource(source.width, source.height, (ctx) => source!.draw(ctx));
    } catch (err) {
      console.warn('camera start failed:', err);
      // US-01: 拒否時の平易な案内+シミュレータ導線
      cameraView.showNotice(
        'カメラを使う許可が必要です。ブラウザの設定でこのサイトのカメラを「許可」にして、再読み込みしてください。',
        [
          { label: '再試行', testId: 'camera-view-retry-button', onClick: () => void startSource('camera') },
          {
            label: 'シミュレータで試す',
            testId: 'camera-view-simulator-button',
            onClick: () => {
              settingsStore.save({ source: 'simulator' });
            },
          },
        ],
      );
    }
  };

  // 4. エンジン初期化(フォールバック通知: R-1)
  const applyEngine = async (kind: Settings['engine']): Promise<void> => {
    if (kind === 'tesseract' || kind === 'aws') statusBar.showNotice('認識エンジンを読み込み中…', 3000);
    const fallback = await service.setEngine(kind);
    if (fallback) {
      statusBar.showNotice('OCRエンジンを読み込めなかったため、標準エンジンで続行します');
      settingsStore.save({ engine: 'template' });
    }
  };

  // 設定変更の反映
  let lastSettings = settingsStore.get();
  settingsStore.onChange((s) => {
    if (activeTargets.size === 0) controller.setInterval(s.intervalMs); // 検索中は専用間隔を維持
    service.setConfidenceThreshold(s.confidenceThreshold);
    if (s.engine !== lastSettings.engine) void applyEngine(s.engine);
    if (s.source !== lastSettings.source) void startSource(s.source);
    lastSettings = s;
  });

  // 5. 起動(バージョンを一時表示 — 旧キャッシュ版との判別用。常時表示は設定パネル)
  statusBar.showNotice(`v${appVersion}`, 6000);
  await applyEngine(lastSettings.engine);
  await startSource(lastSettings.source);
}

registerSW({ immediate: true }); // U3-NFR-2/4: プリキャッシュ+自動更新(本番ビルドのみ有効)
void bootstrap();
