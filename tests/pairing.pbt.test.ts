/**
 * PBT P7: 検出・ペア化の事後条件 — どんな入力でも PairCandidate は BR-1/2/3 を満たす。
 * 合成シーン(Canvas不要のピクセル合成)で TemplateRecognizer をNode上でE2E実行する。
 */
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { findChainCandidates, pairChainToTile } from '../src/vision/detect';
import { DEFAULT_CONFIG } from '../src/vision/config';
import { TemplateRecognizer } from '../src/vision/template/recognizer';
import type { Component, RgbaImage } from '../src/vision/types';
import { isValidDigits, isValidLetter } from '../src/vision/types';
import { digitsArb, letterArb } from './generators';
import { downsampleAlpha, syntheticRasterizer } from './synthetic-font';

const rasterize = syntheticRasterizer();

/** グレー値をRGBAへ敷き詰める合成フレームビルダ(Canvas不要)。 */
class FrameBuilder {
  gray: Uint8Array;
  constructor(
    readonly width: number,
    readonly height: number,
    bg = 20,
  ) {
    this.gray = new Uint8Array(width * height).fill(bg);
  }

  fillRect(x: number, y: number, w: number, h: number, v: number): void {
    for (let yy = y; yy < y + h; yy++) {
      if (yy < 0 || yy >= this.height) continue;
      for (let xx = x; xx < x + w; xx++) {
        if (xx < 0 || xx >= this.width) continue;
        this.gray[yy * this.width + xx] = v;
      }
    }
  }

  /** alphaマスク(>128)の画素を値vで打つ。 */
  stampAlpha(alpha: Uint8Array, size: number, cx: number, cy: number, v: number): void {
    const off = Math.floor(size / 2);
    for (let yy = 0; yy < size; yy++) {
      const y = cy - off + yy;
      if (y < 0 || y >= this.height) continue;
      for (let xx = 0; xx < size; xx++) {
        if (alpha[yy * size + xx] <= 128) continue;
        const x = cx - off + xx;
        if (x < 0 || x >= this.width) continue;
        this.gray[y * this.width + x] = v;
      }
    }
  }

  toImage(): RgbaImage {
    const data = new Uint8ClampedArray(this.width * this.height * 4);
    for (let i = 0; i < this.gray.length; i++) {
      data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = this.gray[i];
      data[i * 4 + 3] = 255;
    }
    return { data, width: this.width, height: this.height };
  }
}

/** 1タイル(明タイル+暗文字+上方の明3桁)を合成シーンに置く。 */
function placeCard(fb: FrameBuilder, letter: string, digits: string, tileX: number, tileY: number): void {
  const TILE = 72;
  fb.fillRect(tileX, tileY, TILE, TILE, 230);
  const letterRaster = rasterize(letter, 0, 'synthetic', false)!;
  const small = downsampleAlpha(letterRaster.alpha, letterRaster.size, 2); // 32px ≤ 0.78*TILE
  fb.stampAlpha(small.alpha, small.size, tileX + TILE / 2, tileY + TILE / 2, 8);
  // 3桁チェーン: タイル上方に約13pxのglyphを16px間隔で(間隔 < chainGapFactor×高さ)
  const digitY = tileY - 24;
  for (let d = 0; d < 3; d++) {
    const raster = rasterize(digits[d], 0, 'synthetic', true)!;
    const tiny = downsampleAlpha(raster.alpha, raster.size, 2); // コンパクトglyphの1/2縮小
    fb.stampAlpha(tiny.alpha, tiny.size, tileX + TILE / 2 + (d - 1) * 16, digitY, 210);
  }
}

let recognizer: TemplateRecognizer;

beforeAll(async () => {
  // マージン閾値は実フォント向けの調整値。低忠実度の合成フォントでは
  // 文字間マージンが本質的に小さいため、テストでは緩めた設定を注入する
  // (パイプラインの機構を検証するのが目的で、閾値チューニングの検証ではない)。
  recognizer = new TemplateRecognizer(rasterize, {
    ...DEFAULT_CONFIG,
    digitMarginMin: 0.004,
    letterMarginMin: 0.004,
  });
  await recognizer.init();
});

describe('P7: 認識結果の事後条件(BR-1/2/3)', () => {
  it('合成シーンの全出力が有効なletter/digits/confidenceを持つ', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(letterArb, digitsArb), { minLength: 1, maxLength: 4 }),
        async (cards) => {
          const fb = new FrameBuilder(640, 360);
          cards.forEach(([letter, digits], i) => {
            placeCard(fb, letter, digits, 60 + (i % 2) * 300, 80 + Math.floor(i / 2) * 160);
          });
          const result = await recognizer.recognize(fb.toImage());
          for (const c of [...result.candidates, ...result.lowConfidence]) {
            if (result.candidates.includes(c)) {
              expect(isValidLetter(c.letter)).toBe(true);
            }
            expect(isValidDigits(c.digits)).toBe(true);
            expect(c.confidence).toBeGreaterThanOrEqual(0);
            expect(c.confidence).toBeLessThanOrEqual(1);
            expect(c.cardBox.w).toBeGreaterThan(0);
            expect(c.cardBox.h).toBeGreaterThan(0);
          }
          expect(result.cardCount).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 25 }, // E2Eなので回数を絞る(1回あたり数十ms)
    );
  });

  it('複数カードのペアを正しく読み取る(既知配置のオラクル)', async () => {
    const fb = new FrameBuilder(640, 360);
    placeCard(fb, 'A', '123', 80, 100);
    placeCard(fb, 'Q', '907', 400, 100);
    const result = await recognizer.recognize(fb.toImage());
    const keys = result.candidates.map((c) => `${c.letter}-${c.digits}`).sort();
    expect(keys).toEqual(['A-123', 'Q-907']);
    expect(result.cardCount).toBe(2);
  });
});

describe('P7補助: 幾何ヘルパの健全性', () => {
  const compArb: fc.Arbitrary<Component> = fc
    .tuple(
      fc.integer({ min: 0, max: 600 }),
      fc.integer({ min: 0, max: 300 }),
      fc.integer({ min: 4, max: 40 }),
      fc.integer({ min: 4, max: 40 }),
    )
    .map(([x0, y0, w, h]) => ({
      x0,
      y0,
      x1: x0 + w - 1,
      y1: y0 + h - 1,
      w,
      h,
      area: Math.ceil((w * h) / 2),
      cx: x0 + (w - 1) / 2,
      cy: y0 + (h - 1) / 2,
    }));

  it('チェーン候補は必ず3つの相異なる成分インデックスを持つ', () => {
    fc.assert(
      fc.property(fc.array(compArb, { minLength: 0, maxLength: 12 }), (comps) => {
        const idx = comps.map((_, i) => i);
        const chains = findChainCandidates(comps, idx, DEFAULT_CONFIG);
        for (const ch of chains) {
          expect(new Set(ch.idxs).size).toBe(3);
          expect(Number.isFinite(ch.angleDeg)).toBe(true);
          for (const i of ch.idxs) {
            expect(i).toBeGreaterThanOrEqual(0);
            expect(i).toBeLessThan(comps.length);
          }
        }
      }),
    );
  });

  it('pairChainToTile は -1 か有効なタイル添字のみ返す', () => {
    fc.assert(
      fc.property(fc.array(compArb, { minLength: 3, maxLength: 12 }), (comps) => {
        const idx = comps.map((_, i) => i);
        const chains = findChainCandidates(comps, idx, DEFAULT_CONFIG);
        for (const ch of chains) {
          const t = pairChainToTile(comps, idx, ch, DEFAULT_CONFIG);
          expect(t === -1 || (t >= 0 && t < comps.length)).toBe(true);
        }
      }),
    );
  });
});
