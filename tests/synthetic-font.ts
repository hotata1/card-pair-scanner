/**
 * テスト用の合成glyphラスタライザ(PBT-07: DOM/Canvas非依存でP6等を検証するための代替フォント)。
 * 文字ごとに決定論的なブロックパターンを生成し、角度はブロック中心の回転で表現する。
 * 同一(文字,角度)は常に同一ラスタ → テンプレートと照会が一致し、分類ラウンドトリップが成立する。
 */
import { seededRng } from '../src/sim/simulator';
import type { GlyphRasterizer } from '../src/vision/template/templates';

export const SYNTH_SIZE = 64;

export function syntheticRasterizer(): GlyphRasterizer {
  return (ch, angleDeg, _font, bold) => {
    const size = SYNTH_SIZE;
    const alpha = new Uint8Array(size * size);
    const rng = seededRng(ch.charCodeAt(0) * 7919 + 17);
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const half = size / 2;
    // ブロックを文字固有のランダムウォークで配置(ステップ<ブロック辺 →
    // 隣接ブロックが必ず重なり、glyph全体が1つの連結成分になる)。位置を回転する。
    // bold(数字用)は中央の縦バー(高さを安定させる)+コンパクトな装飾ブロックにし、
    // 実表示の「タイルより十分小さく背が揃った数字」を模擬する(チェーン制約の前提)。
    const extent = bold ? 6 : 18;
    const stamp = (bx: number, by: number, bw: number, bh: number): void => {
      const rx = cos * bx - sin * by;
      const ry = sin * bx + cos * by;
      const cx = Math.round(half + rx);
      const cy = Math.round(half + ry);
      for (let dy = -bh; dy < bh; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= size) continue;
        for (let dx = -bw; dx < bw; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= size) continue;
          alpha[y * size + x] = 255;
        }
      }
    };
    if (bold) stamp(rng() * 10 - 5, 0, 3, 12); // 縦バー(6×24)で高さを固定。x位置は文字固有
    let bx = 0;
    let by = 0;
    for (let b = 0; b < 6; b++) {
      if (b > 0) {
        bx = Math.max(-extent, Math.min(extent, bx + (rng() * 14 - 7)));
        by = Math.max(-extent, Math.min(extent, by + (rng() * 14 - 7)));
      }
      stamp(bx, by, 5, 5);
    }
    return { alpha, size };
  };
}

/** alpha配列を1/nに間引いた縮小コピー(合成シーン描画用)。 */
export function downsampleAlpha(alpha: Uint8Array, size: number, factor: number): { alpha: Uint8Array; size: number } {
  const out = Math.floor(size / factor);
  const dst = new Uint8Array(out * out);
  for (let y = 0; y < out; y++) {
    for (let x = 0; x < out; x++) {
      dst[y * out + x] = alpha[y * factor * size + x * factor];
    }
  }
  return { alpha: dst, size: out };
}
