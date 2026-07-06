import { extractGrid, gridSum } from '../grid';
import { DIGITS, LETTERS, type Component } from '../types';

/**
 * 認識対象フォント。実表示のフォントは特定できていないため(設計Q5)、
 * 複数のグロテスク系でバンクを作り最も近いものにマッチさせる(letter-locator踏襲)。
 * 実フォント判明時はここを差し替える。
 */
export const TARGET_FONTS = [
  'Arial, sans-serif',
  'Verdana, sans-serif',
  'Tahoma, sans-serif',
  '"Segoe UI", sans-serif',
];

/** バンクがカバーする面内回転角(度)。±54°を9°刻み(手持ち撮影の実用範囲)。 */
export const TEMPLATE_ANGLES = [-54, -45, -36, -27, -18, -9, 0, 9, 18, 27, 36, 45, 54];

export interface Template {
  ch: string;
  isDigit: boolean;
  angle: number;
  grid: Float32Array;
  ink: number;
  /** 正方形パディング前のバウンディングボックス縦横比(w/h)。 */
  aspect: number;
}

export interface TemplateBank {
  templates: Template[];
}

/**
 * glyphラスタライザ抽象。ブラウザではCanvas実装(rasterize.ts)、
 * Nodeテストでは合成フォント実装を注入する(U1-NFR-M1: DOM非依存)。
 * 戻り値: size×size のアルファ配列(0〜255)。描画不能なら null。
 */
export type GlyphRasterizer = (ch: string, angleDeg: number, fontFamily: string, bold: boolean) => {
  alpha: Uint8Array;
  size: number;
} | null;

/**
 * 全glyph(0-9, A-Z)×フォント×角度をラスタライズし、正規化カバレッジグリッドの
 * テンプレートバンクを構築する。初回のみ実行しメモリ保持(NFR設計P-4)。
 */
export function buildTemplateBank(
  rasterize: GlyphRasterizer,
  fonts: string[] = TARGET_FONTS,
  angles: number[] = TEMPLATE_ANGLES,
): TemplateBank {
  const templates: Template[] = [];
  const chars = DIGITS + LETTERS;

  for (const fontFamily of fonts) {
    for (const ch of chars) {
      const isDigit = ch < 'A';
      for (const angle of angles) {
        // 文字は細身(実カード準拠)、数字は太字(小さい数字の断片化対策)。
        const r = rasterize(ch, angle, fontFamily, isDigit);
        if (!r) continue;
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
        if (x1 < x0) continue;
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
        templates.push({
          ch,
          isDigit,
          angle,
          grid,
          ink: gridSum(grid),
          aspect: comp.w / comp.h,
        });
      }
    }
  }
  return { templates };
}
