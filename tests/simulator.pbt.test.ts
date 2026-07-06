/** PBT P8: シミュレータのシード再現性と真値の整合性(BR-10)。 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createScene, ITEM_COUNT, numberEnvelope, seededRng } from '../src/sim/simulator';
import { scoreAgainstTruth } from '../src/harness/accuracy';
import { isValidDigits, isValidLetter } from '../src/vision/types';
import { seedArb } from './generators';

describe('P8: シミュレータの決定論性', () => {
  it('同一シード → 完全に同一のシーン', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const a = createScene(seededRng(seed));
        const b = createScene(seededRng(seed));
        expect(a).toEqual(b);
      }),
    );
  });

  it('シーンは77タイル、数字は全タイルで一意、値はドメイン制約を満たす', () => {
    fc.assert(
      fc.property(seedArb, (seed) => {
        const items = createScene(seededRng(seed));
        expect(items.length).toBe(ITEM_COUNT);
        const nums = new Set(items.map((i) => i.number));
        expect(nums.size).toBe(ITEM_COUNT);
        for (const item of items) {
          expect(isValidLetter(item.letter)).toBe(true);
          expect(isValidDigits(item.number)).toBe(true);
          expect(item.period).toBeGreaterThan(0);
          expect(item.duty).toBeGreaterThan(0);
          expect(item.duty).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('点滅エンベロープのalphaは常に0〜1', () => {
    fc.assert(
      fc.property(seedArb, fc.double({ min: 0, max: 100, noNaN: true }), (seed, t) => {
        const items = createScene(seededRng(seed));
        for (const item of items.slice(0, 10)) {
          const env = numberEnvelope(item, t);
          expect(env.alpha).toBeGreaterThanOrEqual(0);
          expect(env.alpha).toBeLessThanOrEqual(1);
          expect(env.slide).toBeGreaterThanOrEqual(0);
          expect(env.slide).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

describe('精度ハーネスの突合ロジック(P9の純粋部分)', () => {
  it('真値そのものを検出として渡すと誤検出0', () => {
    fc.assert(
      fc.property(seedArb, fc.double({ min: 0, max: 60, noNaN: true }), (seed, t) => {
        const items = createScene(seededRng(seed));
        const candidates = items.map((i) => ({
          letter: i.letter,
          digits: i.number,
          confidence: 1,
          cardBox: { x: i.x, y: i.y, w: 48, h: 48 },
        }));
        const report = scoreAgainstTruth(candidates, items, t);
        expect(report.falsePairs.length).toBe(0);
        if (report.recall !== null) expect(report.recall).toBe(1);
      }),
    );
  });

  it('真値に無いペアは必ず誤検出として計上される', () => {
    const items = createScene(seededRng(1));
    const bogus = { letter: 'Z', digits: '000', confidence: 1, cardBox: { x: 0, y: 0, w: 1, h: 1 } };
    // 偶然の一致を避ける: 真値に含まれないペアであることを確認してから
    const exists = items.some((i) => i.letter === 'Z' && i.number === '000');
    if (!exists) {
      const report = scoreAgainstTruth([bogus], items, 0);
      expect(report.falsePairs.length).toBe(1);
    }
  });
});
