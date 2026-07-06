/** PBT P6: 既知glyphの「生成→分類」ラウンドトリップ(合成フォント使用)。 */
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractGrid, gridSum } from '../src/vision/grid';
import { classifyGlyph } from '../src/vision/template/classify';
import { buildTemplateBank, type TemplateBank } from '../src/vision/template/templates';
import type { Component } from '../src/vision/types';
import { bankAngleArb, digitCharArb, letterArb } from './generators';
import { syntheticRasterizer } from './synthetic-font';

const rasterize = syntheticRasterizer();
let bank: TemplateBank;

beforeAll(() => {
  // 合成フォント1書体でバンク構築(Canvas不要: U1-NFR-M1)
  bank = buildTemplateBank(rasterize, ['synthetic']);
});

/** ラスタからバンク構築と同じ手順で照会グリッドを作る。 */
function queryOf(ch: string, angle: number): { grid: Float32Array; sum: number; aspect: number } | null {
  // バンク構築と同じ規約: 数字はbold(templates.ts参照)
  const r = rasterize(ch, angle, 'synthetic', ch < 'A');
  if (!r) return null;
  const { alpha, size } = r;
  let x0 = size;
  let y0 = size;
  let x1 = 0;
  let y1 = 0;
  for (let i = 0; i < size * size; i++) {
    if (alpha[i] > 128) {
      const x = i % size;
      const y = (i / size) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < x0) return null;
  const comp: Component = {
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    area: 0,
    cx: (x0 + x1) / 2,
    cy: (y0 + y1) / 2,
  };
  const grid = extractGrid(alpha, size, comp, 255);
  return { grid, sum: gridSum(grid), aspect: comp.w / comp.h };
}

describe('P6: classify round-trip', () => {
  it('文字: rasterize(ch, angle) → classify = ch、スコアは0〜1', () => {
    fc.assert(
      fc.property(letterArb, bankAngleArb, (ch, angle) => {
        const q = queryOf(ch, angle);
        expect(q).not.toBeNull();
        const c = classifyGlyph(q!.grid, q!.sum, q!.aspect, bank, 'letter');
        expect(c.ch).toBe(ch);
        expect(c.score).toBeGreaterThan(0.9); // 同一ラスタなのでほぼ1
        expect(c.score).toBeLessThanOrEqual(1);
      }),
    );
  });

  it('数字: rasterize(d, angle) → classify = d', () => {
    fc.assert(
      fc.property(digitCharArb, bankAngleArb, (d, angle) => {
        const q = queryOf(d, angle);
        expect(q).not.toBeNull();
        const c = classifyGlyph(q!.grid, q!.sum, q!.aspect, bank, 'digit', angle, 7);
        expect(c.ch).toBe(d);
      }),
    );
  });

  it('文字クエリをdigitバンクで分類しても文字は返らない(アルファベット分離)', () => {
    fc.assert(
      fc.property(letterArb, (ch) => {
        const q = queryOf(ch, 0);
        const c = classifyGlyph(q!.grid, q!.sum, q!.aspect, bank, 'digit');
        expect('0123456789?'.includes(c.ch)).toBe(true);
      }),
    );
  });
});
