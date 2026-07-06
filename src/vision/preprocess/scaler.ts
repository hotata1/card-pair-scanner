import type { Rect, RgbaImage } from '../types';

/**
 * FrameScaler(LC-1): 入力フレームを処理解像度上限に収め、
 * 結果座標を元解像度へ逆変換する。ダウンスケールはボックス平均(純粋実装、Canvas不要)。
 */
export class FrameScaler {
  /** 直近の縮小率(出力px / 入力px)。1 = 縮小なし。 */
  scale = 1;

  constructor(
    private maxW: number,
    private maxH: number,
  ) {}

  fit(img: RgbaImage): RgbaImage {
    const { width, height } = img;
    const s = Math.min(1, this.maxW / width, this.maxH / height);
    this.scale = s;
    if (s >= 1) return img;

    const ow = Math.max(1, Math.round(width * s));
    const oh = Math.max(1, Math.round(height * s));
    const out = new Uint8ClampedArray(ow * oh * 4);
    const src = img.data;
    for (let oy = 0; oy < oh; oy++) {
      const sy0 = Math.floor((oy / oh) * height);
      const sy1 = Math.max(sy0 + 1, Math.floor(((oy + 1) / oh) * height));
      for (let ox = 0; ox < ow; ox++) {
        const sx0 = Math.floor((ox / ow) * width);
        const sx1 = Math.max(sx0 + 1, Math.floor(((ox + 1) / ow) * width));
        let r = 0;
        let g = 0;
        let b = 0;
        let cnt = 0;
        for (let y = sy0; y < sy1; y++) {
          const row = y * width;
          for (let x = sx0; x < sx1; x++) {
            const p = (row + x) * 4;
            r += src[p];
            g += src[p + 1];
            b += src[p + 2];
            cnt++;
          }
        }
        const o = (oy * ow + ox) * 4;
        out[o] = r / cnt;
        out[o + 1] = g / cnt;
        out[o + 2] = b / cnt;
        out[o + 3] = 255;
      }
    }
    return { data: out, width: ow, height: oh };
  }

  /** 処理座標系のRectを元解像度座標へ戻す。 */
  unscaleRect(r: Rect): Rect {
    const s = this.scale;
    if (s >= 1) return r;
    return { x: r.x / s, y: r.y / s, w: r.w / s, h: r.h / s };
  }
}
