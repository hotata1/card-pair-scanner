import type { Classified } from '../types';
import type { TemplateBank } from './templates';

/** Dice(F1)重なり係数 — 細いglyph形状に頑健。 */
function dice(a: Float32Array, b: Float32Array, sumA: number, sumB: number): number {
  let inter = 0;
  for (let i = 0; i < a.length; i++) {
    inter += Math.min(a[i], b[i]);
  }
  return (2 * inter) / (sumA + sumB + 1e-6);
}

/**
 * カバレッジグリッドをテンプレートバンクと照合(PBT: P6のラウンドトリップ対象)。
 * angleHint があれば近い角度のテンプレートのみ照合(数字の誤読抑制)。
 */
export function classifyGlyph(
  grid: Float32Array,
  sum: number,
  aspect: number,
  bank: TemplateBank,
  kind: 'digit' | 'letter',
  angleHint?: number,
  angleTol = 7,
): Classified {
  const wantDigit = kind === 'digit';
  let bestCh = '?';
  let bestScore = 0;
  let runnerUp = 0;
  for (const t of bank.templates) {
    if (t.isDigit !== wantDigit) continue;
    if (angleHint !== undefined && Math.abs(t.angle - angleHint) > angleTol) continue;
    // 事前プルーニング: アスペクト比・ink量が大きく違うものは照合しない。
    const ar = aspect > t.aspect ? aspect / t.aspect : t.aspect / aspect;
    if (ar > 1.6) continue;
    if (Math.abs(t.ink - sum) / (t.ink + sum + 1e-6) > 0.35) continue;
    const s = dice(grid, t.grid, sum, t.ink);
    if (s > bestScore) {
      if (t.ch !== bestCh) runnerUp = bestScore;
      bestScore = s;
      bestCh = t.ch;
    } else if (t.ch !== bestCh && s > runnerUp) {
      runnerUp = s;
    }
  }
  return { ch: bestCh, score: bestScore, margin: bestScore - runnerUp };
}
