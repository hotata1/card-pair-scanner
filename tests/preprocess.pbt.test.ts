/** PBT: 前処理層のプロパティ P1〜P5(business-rules.md)。 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { extractGrid, GRID } from '../src/vision/grid';
import { binarize, foregroundRatio, otsuThreshold } from '../src/vision/preprocess/binarize';
import { ComponentFinder } from '../src/vision/preprocess/components';
import { toGray } from '../src/vision/preprocess/gray';
import type { GrayFrame } from '../src/vision/types';
import { binaryMaskArb, grayFrameArb, uniformGrayFrameArb } from './generators';

/** f(x) = binarize(x, otsu(x)) を0/255のGrayFrameとして返す(P2の合成関数)。 */
function binarizeNormalized(g: GrayFrame): GrayFrame {
  const bin = binarize(g, otsuThreshold(g));
  const data = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) data[i] = bin[i] * 255;
  return { width: g.width, height: g.height, data };
}

describe('P3: toGray', () => {
  it('出力長 = width*height、全値0〜255', () => {
    fc.assert(
      fc.property(grayFrameArb, (g) => {
        // RGBAフレームをグレー値から合成して往復させる
        const rgba = new Uint8ClampedArray(g.width * g.height * 4);
        for (let i = 0; i < g.data.length; i++) {
          rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = g.data[i];
          rgba[i * 4 + 3] = 255;
        }
        const out = toGray({ data: rgba, width: g.width, height: g.height });
        expect(out.data.length).toBe(g.width * g.height);
        for (let i = 0; i < out.data.length; i++) {
          expect(out.data[i]).toBeGreaterThanOrEqual(0);
          expect(out.data[i]).toBeLessThanOrEqual(255);
        }
      }),
    );
  });

  it('定数色画像 → 全画素が同値', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), fc.integer({ min: 4, max: 16 }), (v, size) => {
        const rgba = new Uint8ClampedArray(size * size * 4);
        for (let i = 0; i < size * size; i++) {
          rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
          rgba[i * 4 + 3] = 255;
        }
        const out = toGray({ data: rgba, width: size, height: size });
        const first = out.data[0];
        for (let i = 1; i < out.data.length; i++) expect(out.data[i]).toBe(first);
      }),
    );
  });
});

describe('P1: binarize', () => {
  it('出力は0/1のみ、長さ保存、閾値は0〜255', () => {
    fc.assert(
      fc.property(grayFrameArb, (g) => {
        const t = otsuThreshold(g);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(255);
        const bin = binarize(g, t);
        expect(bin.length).toBe(g.data.length);
        for (let i = 0; i < bin.length; i++) {
          expect(bin[i] === 0 || bin[i] === 1).toBe(true);
        }
        const fg = foregroundRatio(bin);
        expect(fg).toBeGreaterThanOrEqual(0);
        expect(fg).toBeLessThanOrEqual(1);
      }),
    );
  });
});

describe('P2: binarize(otsu) の冪等性', () => {
  it('f(f(x)) = f(x)(0/255正規化表現で)', () => {
    fc.assert(
      fc.property(grayFrameArb, (g) => {
        const once = binarizeNormalized(g);
        const twice = binarizeNormalized(once);
        expect(Array.from(twice.data)).toEqual(Array.from(once.data));
      }),
    );
  });

  it('定数画像でも冪等', () => {
    fc.assert(
      fc.property(uniformGrayFrameArb, (g) => {
        const once = binarizeNormalized(g);
        const twice = binarizeNormalized(once);
        expect(Array.from(twice.data)).toEqual(Array.from(once.data));
      }),
    );
  });
});

describe('P4: ComponentFinder', () => {
  it('成分面積の合計 ≤ 前景数、各成分はboxに収まり画像内', () => {
    fc.assert(
      fc.property(binaryMaskArb, (m) => {
        const finder = new ComponentFinder();
        // フィルタ緩め(全成分を観察)
        const comps = finder.find(m.data, m.width, m.height, { minArea: 1, minDim: 1, maxDim: 999 });
        let fg = 0;
        for (let i = 0; i < m.data.length; i++) fg += m.data[i];
        let total = 0;
        for (const c of comps) {
          total += c.area;
          expect(c.area).toBeGreaterThan(0);
          expect(c.area).toBeLessThanOrEqual(c.w * c.h);
          expect(c.x0).toBeGreaterThanOrEqual(0);
          expect(c.y0).toBeGreaterThanOrEqual(0);
          expect(c.x1).toBeLessThan(m.width);
          expect(c.y1).toBeLessThan(m.height);
          expect(c.cx).toBeGreaterThanOrEqual(c.x0);
          expect(c.cx).toBeLessThanOrEqual(c.x1);
        }
        // フィルタなし相当なので、ラベリングは前景を過不足なく分割する
        expect(total).toBe(fg);
      }),
    );
  });
});

describe('P5: extractGrid', () => {
  it('出力は常にGRID²要素、全値0.0〜1.0', () => {
    fc.assert(
      fc.property(binaryMaskArb, (m) => {
        const finder = new ComponentFinder();
        const comps = finder.find(m.data, m.width, m.height, { minArea: 1, minDim: 1, maxDim: 999 });
        for (const c of comps.slice(0, 5)) {
          const grid = extractGrid(m.data, m.width, c, 1);
          expect(grid.length).toBe(GRID * GRID);
          // expectをセル単位で呼ぶと低速なため、違反時のみ失敗させる
          for (let i = 0; i < grid.length; i++) {
            if (grid[i] < 0 || grid[i] > 1) {
              throw new Error(`grid[${i}] = ${grid[i]} is out of [0,1]`);
            }
          }
        }
      }),
    );
  }, 30000);
});
