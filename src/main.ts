/**
 * 本番エントリ: 1画面アプリ(business-logic-model.md の起動シーケンス準拠)。
 * 開発ハーネスは harness.html(src/harness-main.ts)に分離されている。
 */
import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { CaptureController } from './services/capture-controller';
import { RecognitionService, type FrameOutcome } from './services/recognition-service';
import { CameraSource } from './sources/camera';
import { SimulatorSource } from './sources/simulator-source';
import type { VideoSource } from './sources/types';
import { RecordStore, type PairRecord } from './state/record-store';
import { SettingsStore, type Settings } from './state/settings-store';
import { CameraView } from './ui/camera-view';
import { confirmDialog } from './ui/confirm-dialog';
import { ControlBar } from './ui/control-bar';
import { editDialog } from './ui/edit-dialog';
import { ResultsPanel } from './ui/results-panel';
import { SettingsPanel } from './ui/settings-panel';
import { StatusBar } from './ui/status-bar';
import { EngineRegistry } from './vision/registry';
import { createCanvasRasterizer } from './vision/template/rasterize';
import { TemplateRecognizer } from './vision/template/recognizer';
import { TesseractRecognizer } from './vision/tesseract/recognizer';

async function bootstrap(): Promise<void> {
  const app = document.getElementById('app')!;

  // 1. 設定復元
  const settingsStore = new SettingsStore();

  // 2. 記録ロード
  const recordStore = new RecordStore();

  // 認識基盤
  const registry = new EngineRegistry();
  registry.register(new TemplateRecognizer(createCanvasRasterizer()));
  registry.register(new TesseractRecognizer());
  const service = new RecognitionService(registry, recordStore, settingsStore.get().confidenceThreshold);

  // UI構築
  const cameraView = new CameraView();
  const statusBar = new StatusBar();
  const settingsPanel = new SettingsPanel({
    onChange: (patch) => settingsStore.save(patch),
    onClearAll: () => recordStore.clear(),
    getRecordCount: () => recordStore.size,
  });
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
  const controlBar = new ControlBar({
    onAutoToggle: () => {
      if (controller.autoRunning) {
        controller.stopAuto();
      } else {
        controller.startAuto(); // BR-U2-9: 明示操作でのみ開始
      }
      controlBar.setAutoRunning(controller.autoRunning);
    },
    // シャッター1回 = 8枚/4秒の連写(点滅する数字を周期をまたいで捕捉する)
    onShutter: () => {
      void controller
        .captureBurst(8, 4000, (done, total) => controlBar.setShutterProgress(`${done}/${total}`))
        .finally(() => controlBar.setShutterProgress(null));
    },
    onSettings: () => settingsPanel.open(settingsStore.get()),
  });
  app.replaceChildren(cameraView.root, statusBar.root, controlBar.root, resultsPanel.root);

  // 撮影制御
  const onOutcome = (outcome: FrameOutcome): void => {
    cameraView.renderOverlay(outcome);
    // BR-U2-7拡張: 検出0枚も含め毎撮影後に必ずフィードバックを出す
    statusBar.setFrameFeedback(outcome.cardCount, outcome.lowConfidence.length, outcome.added.length);
  };
  const controller = new CaptureController(
    () => cameraView.grabFrame(),
    service,
    settingsStore.get().intervalMs,
    onOutcome,
  );

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
    statusBar.showNotice(kind === 'tesseract' ? '認識エンジンを読み込み中…' : '', 3000);
    const fallback = await service.setEngine(kind);
    if (fallback) {
      statusBar.showNotice('OCRエンジンを読み込めなかったため、標準エンジンで続行します');
      settingsStore.save({ engine: 'template' });
    }
  };

  // 設定変更の反映
  let lastSettings = settingsStore.get();
  settingsStore.onChange((s) => {
    controller.setInterval(s.intervalMs);
    service.setConfidenceThreshold(s.confidenceThreshold);
    if (s.engine !== lastSettings.engine) void applyEngine(s.engine);
    if (s.source !== lastSettings.source) void startSource(s.source);
    lastSettings = s;
  });

  // 5. 起動
  await applyEngine(lastSettings.engine);
  await startSource(lastSettings.source);
}

registerSW({ immediate: true }); // U3-NFR-2/4: プリキャッシュ+自動更新(本番ビルドのみ有効)
void bootstrap();
