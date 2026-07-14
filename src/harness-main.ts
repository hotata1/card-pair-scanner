/**
 * Unit 1 開発ハーネス(CG-10): シミュレータ映像を認識し、検出枠・ペア候補・
 * 処理時間を表示する最小ページ。本番UIは Unit 2 (app-shell) で実装する。
 */
import { CognitoAuth } from './auth/cognito-auth';
import { aggregateReports, scoreAgainstTruth, type AccuracyReport } from './harness/accuracy';
import { SimulatorSource } from './sources/simulator-source';
import { AwsRecognizer } from './vision/aws/recognizer';
import { PerfMeter } from './vision/perf';
import { EngineRegistry } from './vision/registry';
import { createCanvasRasterizer } from './vision/template/rasterize';
import { TemplateRecognizer } from './vision/template/recognizer';
import { TesseractRecognizer } from './vision/tesseract/recognizer';
import type { EngineKind, PairCandidate, Recognizer, RgbaImage } from './vision/types';

const SIM_SEED = 42;
// AWSエンジンはRekognition呼び出しごとに課金されるため、比較テスト中も呼び出し間隔を抑える
const AWS_TICK_MS = 1500;
const DEFAULT_TICK_MS = 250;

const canvas = document.getElementById('view') as HTMLCanvasElement;
const statusEl = document.getElementById('status')!;
const statsEl = document.getElementById('stats')!;
const pairsEl = document.getElementById('pairs')!;
const btnEngine = document.getElementById('btn-engine') as HTMLButtonElement;
const btnPause = document.getElementById('btn-pause') as HTMLButtonElement;

const source = new SimulatorSource(SIM_SEED);
canvas.width = source.width;
canvas.height = source.height;
const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

const registry = new EngineRegistry();
registry.register(new TemplateRecognizer(createCanvasRasterizer()));
registry.register(new TesseractRecognizer());

// index.html側のログインで既にトークンがあれば(同一オリジンのlocalStorage共有)そのまま使う。
// 未ログインならawsは比較対象から外す(ハーネス自体にログインUIは持たせない)。
const auth = new CognitoAuth({
  domain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
});
const awsEndpoint = import.meta.env.VITE_AWS_RECOGNIZE_URL;
const awsAvailable = Boolean(awsEndpoint && auth.configured);
if (awsAvailable) {
  registry.register(new AwsRecognizer(awsEndpoint!, () => auth.getValidAccessToken()));
}
const ENGINE_CYCLE: EngineKind[] = awsAvailable ? ['template', 'tesseract', 'aws'] : ['template', 'tesseract'];

const perf = new PerfMeter();
perf.enabled = true;

let engineKind: EngineKind = 'template';
let recognizer: Recognizer | undefined;
let paused = false;
let busy = false;
const seenPairs = new Map<string, PairCandidate>();
const reports: AccuracyReport[] = [];

async function selectEngine(kind: EngineKind): Promise<void> {
  statusEl.textContent = `loading ${kind}...`;
  const sel = await registry.select(kind);
  recognizer = sel.recognizer;
  engineKind = sel.recognizer.kind;
  btnEngine.textContent = `engine: ${engineKind}`;
  statusEl.textContent = sel.fallbackReason ? `fallback→template (${sel.fallbackReason})` : 'ready';
  // エンジン切替後の集計に前エンジンの結果を混ぜない(精度比較の公平性のため)
  reports.length = 0;
  seenPairs.clear();
}

btnEngine.addEventListener('click', () => {
  const idx = ENGINE_CYCLE.indexOf(engineKind);
  void selectEngine(ENGINE_CYCLE[(idx + 1) % ENGINE_CYCLE.length]);
});
btnPause.addEventListener('click', () => {
  paused = !paused;
  btnPause.textContent = paused ? 'resume' : 'pause';
});

function drawOverlay(candidates: PairCandidate[], low: PairCandidate[]): void {
  ctx.lineWidth = 2;
  ctx.font = '14px monospace';
  for (const c of candidates) {
    ctx.strokeStyle = '#3f3';
    ctx.strokeRect(c.cardBox.x, c.cardBox.y, c.cardBox.w, c.cardBox.h);
    ctx.fillStyle = '#3f3';
    ctx.fillText(`${c.letter}-${c.digits} ${(c.confidence * 100) | 0}`, c.cardBox.x, c.cardBox.y - 4);
  }
  for (const c of low) {
    ctx.strokeStyle = '#fa3';
    ctx.strokeRect(c.cardBox.x, c.cardBox.y, c.cardBox.w, c.cardBox.h);
    ctx.fillStyle = '#fa3';
    ctx.fillText(`${c.letter}-${c.digits}?`, c.cardBox.x, c.cardBox.y - 4);
  }
}

async function tick(): Promise<void> {
  if (paused || busy || !recognizer?.ready) return;
  busy = true;
  try {
    source.draw(ctx);
    const frame: RgbaImage = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const tFrame = source.lastT;
    const t0 = performance.now();
    const result = await recognizer.recognize(frame);
    perf.record(`recognize(${engineKind})`, performance.now() - t0);

    drawOverlay(result.candidates, result.lowConfidence);

    // 真値突合(P9 Oracle)+ 累積ペア表(Unit 2 のRecordStore相当の簡易版)。
    reports.push(scoreAgainstTruth(result.candidates, source.items, tFrame));
    if (reports.length > 200) reports.shift();
    for (const c of result.candidates) {
      const key = `${c.letter}-${c.digits}`;
      if (!seenPairs.has(key)) seenPairs.set(key, c);
    }

    if (import.meta.env.DEV) {
      // 精度分析用フック(AccuracyHarnessのブラウザ確認、コンソールから参照)
      (window as unknown as Record<string, unknown>).__cps = {
        items: source.items,
        lastResult: result,
        lastT: tFrame,
        reports,
        seenPairs,
      };
    }

    const agg = aggregateReports(reports);
    const perfSummary = perf.summary()[`recognize(${engineKind})`];
    statsEl.textContent =
      `cards:${result.cardCount} ok:${result.candidates.length} low:${result.lowConfidence.length} ` +
      `| avg ${perfSummary ? perfSummary.avgMs.toFixed(0) : '-'}ms ` +
      `| recall(lit) ${agg.meanRecall !== null ? (agg.meanRecall * 100).toFixed(0) + '%' : '-'} ` +
      `| false ${agg.totalFalse} | unique pairs ${seenPairs.size}/${source.items.length}`;
    pairsEl.textContent = [...seenPairs.keys()].sort().join('  ');
  } catch (err) {
    // R-2: フレーム単位で例外を隔離しループは継続する。
    console.error('frame failed:', err);
  } finally {
    busy = false;
  }
}

async function bootstrap(): Promise<void> {
  await source.start();
  await selectEngine('template');
  // 前フレームの処理完了後に次を予約する方式(services.md の撮影ループ設計)。
  const loop = async (): Promise<void> => {
    await tick();
    setTimeout(() => void loop(), engineKind === 'aws' ? AWS_TICK_MS : DEFAULT_TICK_MS);
  };
  void loop();
}

void bootstrap();
