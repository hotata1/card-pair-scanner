import type { Component } from '../types';

export interface ComponentFilter {
  minArea: number;
  minDim: number;
  maxDim: number;
}

/**
 * 連結成分ラベリング(8近傍、反復flood fill)。
 * バッファはフレーム間で再利用してアロケーションを抑える(letter-locator移植)。
 */
export class ComponentFinder {
  private labels = new Int32Array(0);
  private stack = new Int32Array(0);

  find(bin: Uint8Array, width: number, height: number, filter: ComponentFilter): Component[] {
    const n = width * height;
    if (this.labels.length !== n) {
      this.labels = new Int32Array(n);
      this.stack = new Int32Array(n);
    } else {
      this.labels.fill(0);
    }
    const { labels, stack } = this;
    const comps: Component[] = [];
    let nextLabel = 1;

    for (let start = 0; start < n; start++) {
      if (bin[start] === 0 || labels[start] !== 0) continue;
      let sp = 0;
      stack[sp++] = start;
      labels[start] = nextLabel;
      let x0 = width;
      let y0 = height;
      let x1 = 0;
      let y1 = 0;
      let area = 0;

      while (sp > 0) {
        const p = stack[--sp];
        const px = p % width;
        const py = (p / width) | 0;
        area++;
        if (px < x0) x0 = px;
        if (px > x1) x1 = px;
        if (py < y0) y0 = py;
        if (py > y1) y1 = py;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < 0 || ny >= height) continue;
          const row = ny * width;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            if (nx < 0 || nx >= width) continue;
            const q = row + nx;
            if (bin[q] === 1 && labels[q] === 0) {
              labels[q] = nextLabel;
              stack[sp++] = q;
            }
          }
        }
      }

      const w = x1 - x0 + 1;
      const h = y1 - y0 + 1;
      if (
        area >= filter.minArea &&
        w >= filter.minDim &&
        h >= filter.minDim &&
        w <= filter.maxDim &&
        h <= filter.maxDim
      ) {
        comps.push({
          x0,
          y0,
          x1,
          y1,
          w,
          h,
          area,
          cx: (x0 + x1) / 2,
          cy: (y0 + y1) / 2,
          label: nextLabel,
        });
      }
      nextLabel++;
    }
    return comps;
  }
}
