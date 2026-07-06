import type { GrayFrame, RgbaImage } from '../types';

/** RGBA→グレースケール(ITU-R BT.601 luma、整数近似)。純粋関数(PBT: P3)。 */
export function toGray(img: RgbaImage, out?: Uint8Array): GrayFrame {
  const n = img.width * img.height;
  const data = out && out.length === n ? out : new Uint8Array(n);
  const src = img.data;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    data[i] = (src[p] * 77 + src[p + 1] * 150 + src[p + 2] * 29) >> 8;
  }
  return { width: img.width, height: img.height, data };
}
