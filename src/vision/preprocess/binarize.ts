import type { GrayFrame } from '../types';

/** Otsu法: クラス間分散を最大化する閾値(0〜255)。純粋関数。 */
export function otsuThreshold(gray: GrayFrame): number {
  const hist = new Uint32Array(256);
  const { data } = gray;
  for (let i = 0; i < data.length; i++) hist[data[i]]++;

  const total = data.length;
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];

  let sumBg = 0;
  let weightBg = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumAll - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}

/** 1 = 前景(暗背景上の明るい表示)、0 = 背景。純粋関数(PBT: P1/P2)。 */
export function binarize(gray: GrayFrame, threshold: number, out?: Uint8Array): Uint8Array {
  const { data } = gray;
  const bin = out && out.length === data.length ? out : new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bin[i] = data[i] > threshold ? 1 : 0;
  return bin;
}

/** 前景率(縮退フレーム判定 BR-8 に使用)。 */
export function foregroundRatio(bin: Uint8Array): number {
  let fg = 0;
  for (let i = 0; i < bin.length; i++) fg += bin[i];
  return bin.length === 0 ? 0 : fg / bin.length;
}
