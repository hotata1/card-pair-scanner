/** PBT: RecognitionService — U2-P7(閾値不変条件: PBT-03 / BR-U2-1)+ CaptureController直列化(例示)。 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CaptureController } from '../src/services/capture-controller';
import { RecognitionService, type FrameOutcome } from '../src/services/recognition-service';
import { RecordStore } from '../src/state/record-store';
import { EngineRegistry } from '../src/vision/registry';
import type { PairCandidate, Recognizer, RecognitionResult, RgbaImage } from '../src/vision/types';
import { candidateArb } from './generators';

/** 任意の候補列を返すスタブ認識エンジン。 */
function stubRecognizer(results: RecognitionResult[]): Recognizer {
  let i = 0;
  return {
    kind: 'template',
    ready: true,
    init: async () => {},
    recognize: async () => results[Math.min(i++, results.length - 1)] ?? { candidates: [], lowConfidence: [], cardCount: 0 },
    dispose: () => {},
  };
}

const frame: RgbaImage = { data: new Uint8ClampedArray(4), width: 1, height: 1 };

async function makeService(
  candidates: PairCandidate[],
  threshold: number,
): Promise<{ service: RecognitionService; store: RecordStore; outcome: FrameOutcome }> {
  const store = new RecordStore();
  await store.init(() => Promise.reject(new Error('memory-only')));
  const registry = new EngineRegistry();
  registry.register(stubRecognizer([{ candidates, lowConfidence: [], cardCount: candidates.length }]));
  const service = new RecognitionService(registry, store, threshold);
  await service.setEngine('template');
  const outcome = await service.processFrame(frame);
  return { service, store, outcome };
}

describe('U2-P7: 閾値判定の不変条件(BR-U2-1)', () => {
  it('記録された全レコードの confidence >= 閾値、閾値未満は必ずlowConfidenceへ', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(candidateArb, { maxLength: 20 }),
        fc.double({ min: 0.4, max: 0.9, noNaN: true }),
        async (candidates, threshold) => {
          const { store, outcome } = await makeService(candidates, threshold);
          for (const r of store.getAll()) {
            expect(r.confidence).toBeGreaterThanOrEqual(threshold);
          }
          for (const c of outcome.lowConfidence) {
            expect(c.confidence).toBeLessThan(threshold);
          }
          // 収支: 全候補は accepted か lowConfidence のどちらかに入る
          expect(outcome.accepted.length + outcome.lowConfidence.length).toBe(candidates.length);
          // added + duplicates = accepted
          expect(outcome.added.length + outcome.duplicates).toBe(outcome.accepted.length);
        },
      ),
    );
  });
});

describe('CaptureController(例示)', () => {
  it('手動シャッターと自動撮影が直列に処理される(BR-U2-10)', async () => {
    const store = new RecordStore();
    await store.init(() => Promise.reject(new Error('memory-only')));
    const registry = new EngineRegistry();
    let inFlight = 0;
    let maxInFlight = 0;
    registry.register({
      kind: 'template',
      ready: true,
      init: async () => {},
      recognize: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 5));
        inFlight--;
        return { candidates: [], lowConfidence: [], cardCount: 0 };
      },
      dispose: () => {},
    });
    const service = new RecognitionService(registry, store, 0.65);
    await service.setEngine('template');
    const outcomes: FrameOutcome[] = [];
    const controller = new CaptureController(() => frame, service, 1000, (o) => outcomes.push(o));

    // 同時に複数の手動シャッター → 直列化され並行実行は1のまま
    await Promise.all([controller.captureOnce(), controller.captureOnce(), controller.captureOnce()]);
    expect(maxInFlight).toBe(1);
    expect(outcomes.length).toBe(3);
  });

  it('フレーム取得がnullなら結果を発行しない', async () => {
    const store = new RecordStore();
    await store.init(() => Promise.reject(new Error('memory-only')));
    const registry = new EngineRegistry();
    registry.register(stubRecognizer([]));
    const service = new RecognitionService(registry, store, 0.65);
    await service.setEngine('template');
    const outcomes: FrameOutcome[] = [];
    const controller = new CaptureController(() => null, service, 1000, (o) => outcomes.push(o));
    await controller.captureOnce();
    expect(outcomes.length).toBe(0);
  });

  it('認識中の例外はフレーム単位で隔離される(R-2)', async () => {
    const store = new RecordStore();
    await store.init(() => Promise.reject(new Error('memory-only')));
    const registry = new EngineRegistry();
    let calls = 0;
    registry.register({
      kind: 'template',
      ready: true,
      init: async () => {},
      recognize: async () => {
        calls++;
        if (calls === 1) throw new Error('boom');
        return { candidates: [], lowConfidence: [], cardCount: 0 };
      },
      dispose: () => {},
    });
    const service = new RecognitionService(registry, store, 0.65);
    await service.setEngine('template');
    const errors: unknown[] = [];
    const outcomes: FrameOutcome[] = [];
    const controller = new CaptureController(() => frame, service, 1000, (o) => outcomes.push(o), (e) => errors.push(e));
    await controller.captureOnce(); // 失敗
    await controller.captureOnce(); // 継続して成功
    expect(errors.length).toBe(1);
    expect(outcomes.length).toBe(1);
  });
});
