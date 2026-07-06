/**
 * 例示テスト(example-based)— PBT-10: PBTのみに依存せず、主要シナリオを固定値で文書化する。
 */
import { describe, expect, it } from 'vitest';
import { splitByHeight } from '../src/vision/detect';
import { binarize, otsuThreshold } from '../src/vision/preprocess/binarize';
import { ComponentFinder } from '../src/vision/preprocess/components';
import { FrameScaler } from '../src/vision/preprocess/scaler';
import type { Component, GrayFrame } from '../src/vision/types';

describe('otsuThreshold(例示)', () => {
  it('明暗二峰の画像で両クラスを分離する閾値を返す', () => {
    const data = new Uint8Array(100);
    data.fill(30, 0, 50); // 暗クラス
    data.fill(220, 50); // 明クラス
    const g: GrayFrame = { width: 10, height: 10, data };
    const t = otsuThreshold(g);
    expect(t).toBeGreaterThanOrEqual(30);
    expect(t).toBeLessThan(220);
    const bin = binarize(g, t);
    expect(bin.slice(0, 50).every((v) => v === 0)).toBe(true);
    expect(bin.slice(50).every((v) => v === 1)).toBe(true);
  });
});

describe('ComponentFinder(例示)', () => {
  it('離れた2つの塊を2成分として検出する', () => {
    // 8x4: 左に2x2、右に3x2の塊
    const bin = new Uint8Array([
      1, 1, 0, 0, 0, 1, 1, 1,
      1, 1, 0, 0, 0, 1, 1, 1,
      0, 0, 0, 0, 0, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    const comps = new ComponentFinder().find(bin, 8, 4, { minArea: 1, minDim: 1, maxDim: 10 });
    expect(comps.length).toBe(2);
    const areas = comps.map((c) => c.area).sort((a, b) => a - b);
    expect(areas).toEqual([4, 6]);
  });
});

describe('splitByHeight(例示)', () => {
  const mk = (h: number, i: number): Component => ({
    x0: i * 50,
    y0: 0,
    x1: i * 50 + 10,
    y1: h - 1,
    w: 11,
    h,
    area: 11 * h,
    cx: i * 50 + 5,
    cy: h / 2,
  });

  it('大きなタイルと小さな数字を高さで分離する', () => {
    const comps = [mk(48, 0), mk(50, 1), mk(12, 2), mk(11, 3), mk(13, 4)];
    const { tileIdx, digitIdx } = splitByHeight(comps, 1.6);
    expect(tileIdx.map((i) => comps[i].h).every((h) => h >= 48)).toBe(true);
    expect(digitIdx.map((i) => comps[i].h).every((h) => h <= 13)).toBe(true);
    expect(digitIdx.length).toBe(3);
  });

  it('数字が消灯中(タイルのみ)なら digitIdx は空', () => {
    const comps = [mk(48, 0), mk(50, 1), mk(47, 2)];
    const { digitIdx } = splitByHeight(comps, 1.6);
    expect(digitIdx.length).toBe(0);
  });
});

describe('FrameScaler(例示)', () => {
  it('上限内のフレームは変更しない', () => {
    const scaler = new FrameScaler(1280, 720);
    const img = { data: new Uint8ClampedArray(100 * 50 * 4), width: 100, height: 50 };
    expect(scaler.fit(img)).toBe(img);
    expect(scaler.scale).toBe(1);
  });

  it('大きなフレームは上限に収め、座標を逆変換できる', () => {
    const scaler = new FrameScaler(640, 360);
    const img = { data: new Uint8ClampedArray(1280 * 720 * 4).fill(128), width: 1280, height: 720 };
    const out = scaler.fit(img);
    expect(out.width).toBe(640);
    expect(out.height).toBe(360);
    const back = scaler.unscaleRect({ x: 100, y: 50, w: 20, h: 10 });
    expect(back).toEqual({ x: 200, y: 100, w: 40, h: 20 });
  });
});
