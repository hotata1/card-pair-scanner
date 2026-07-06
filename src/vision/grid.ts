import type { Component } from './types';

// 照合グリッド解像度。16はletter-locatorでの実測調整値(20比で約36%高速、精度差ほぼなし)。
export const GRID = 16;

/**
 * 成分のピクセル強度(0..norm)を GRID×GRID のカバレッジグリッドへサンプリング。
 * サンプリング窓はバウンディングボックスを包む正方形(辺 = max(w,h))で、
 * アスペクト比を保存する("1"/"I" と "7"/"M" の区別に必須)。
 * ボックス外は背景扱いで隣接glyphをマスクする。純粋関数(PBT: P5)。
 */
export function extractGrid(
  values: ArrayLike<number>,
  width: number,
  c: Component,
  norm = 1,
): Float32Array {
  const g = new Float32Array(GRID * GRID);
  const side = Math.max(c.w, c.h);
  const ox = c.cx - side / 2;
  const oy = c.cy - side / 2;
  for (let gy = 0; gy < GRID; gy++) {
    const sy = Math.floor(oy + (gy / GRID) * side);
    const ey = Math.ceil(oy + ((gy + 1) / GRID) * side);
    for (let gx = 0; gx < GRID; gx++) {
      const sx = Math.floor(ox + (gx / GRID) * side);
      const ex = Math.ceil(ox + ((gx + 1) / GRID) * side);
      let sum = 0;
      let count = 0;
      for (let y = sy; y < ey; y++) {
        const inRow = y >= c.y0 && y <= c.y1;
        const row = y * width;
        for (let x = sx; x < ex; x++) {
          if (inRow && x >= c.x0 && x <= c.x1) sum += values[row + x];
          count++;
        }
      }
      g[gy * GRID + gx] = count > 0 ? sum / (count * norm) : 0;
    }
  }
  return g;
}

export function gridSum(grid: Float32Array): number {
  let s = 0;
  for (let i = 0; i < grid.length; i++) s += grid[i];
  return s;
}
