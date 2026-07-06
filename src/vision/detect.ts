/**
 * エンジン共通の検出層: タイル/数字の分離、数字3桁チェーンの幾何候補、
 * タイル内包glyphの抽出、数字→タイルのペア対応付け。
 * glyphの「分類」だけがエンジン差(template/tesseract)であり、本モジュールは分類に依存しない。
 * letter-locator pipeline.ts の実証済みロジックを分類非依存に再構成したもの。
 */
import type { PipelineConfig } from './config';
import { GRID } from './grid';
import type { Component } from './types';

/** タイル内から抽出した暗色glyph(letter分類の入力)。 */
export interface TileGlyph {
  grid: Float32Array;
  sum: number;
  aspect: number;
  /** glyph中心(元フレーム座標、ハイライト用)。 */
  cx: number;
  cy: number;
  /** glyphのバウンディングボックス(タイルローカル座標)。tesseract用の切り出しに使用。 */
  local: { x0: number; y0: number; w: number; h: number };
}

/** 幾何的に成立した3桁チェーン候補(分類前)。 */
export interface ChainCandidate {
  /** 読み順(cx昇順)の成分インデックス。 */
  idxs: [number, number, number];
  /** チェーンの面内回転角(度)。 */
  angleDeg: number;
  cx: number;
  cy: number;
}

/**
 * 明るい連結成分は「大きな白タイル」と「小さな数字」の二峰分布。
 * 高さの1D Otsuで分離する(クラスタが近すぎる場合は数字なしと判定)。
 */
export function splitByHeight(
  comps: Component[],
  ratio: number,
): { tileIdx: number[]; digitIdx: number[] } {
  const idx = comps.map((_, i) => i).sort((a, b) => comps[a].h - comps[b].h);
  const hs = idx.map((i) => comps[i].h);
  const n = hs.length;
  if (n < 2) return { tileIdx: idx, digitIdx: [] };

  const prefix = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i] + hs[i];
  const total = prefix[n];

  let cut = -1;
  let best = 0;
  for (let i = 1; i < n; i++) {
    const m0 = prefix[i] / i;
    const m1 = (total - prefix[i]) / (n - i);
    const between = i * (n - i) * (m0 - m1) ** 2;
    if (between > best) {
      best = between;
      cut = i;
    }
  }
  if (cut <= 0) return { tileIdx: idx, digitIdx: [] };

  const meanShort = prefix[cut] / cut;
  const meanTall = (total - prefix[cut]) / (n - cut);
  if (meanTall / Math.max(meanShort, 1) < ratio) {
    return { tileIdx: idx, digitIdx: [] };
  }
  return { digitIdx: idx.slice(0, cut), tileIdx: idx.slice(cut) };
}

/**
 * 回転非依存の3桁チェーン検出(幾何のみ、分類なし)。
 * 各数字片を「中央」と仮定し、反対側に等間隔で並ぶ近傍対を探す。
 * 2桁以下・4桁以上はここで自然に落ちる(BR-2/BR-6: 点滅中間状態は候補にならない)。
 */
export function findChainCandidates(comps: Component[], digitIdx: number[], cfg: PipelineConfig): ChainCandidate[] {
  const candidates: ChainCandidate[] = [];
  const seen = new Set<string>();
  for (const j of digitIdx) {
    const cj = comps[j];
    const nbs: { m: number; dist: number; ang: number }[] = [];
    for (const m of digitIdx) {
      if (m === j) continue;
      const cm = comps[m];
      const dx = cm.cx - cj.cx;
      const dy = cm.cy - cj.cy;
      const dist = Math.hypot(dx, dy);
      const maxH = Math.max(cj.h, cm.h);
      if (dist > cfg.chainGapFactor * maxH) continue;
      if (maxH / Math.min(cj.h, cm.h) > 1.5) continue;
      nbs.push({ m, dist, ang: Math.atan2(dy, dx) });
    }
    for (let p = 0; p < nbs.length; p++) {
      for (let q = p + 1; q < nbs.length; q++) {
        const A = nbs[p];
        const B = nbs[q];
        // 両隣は j を挟んで反対側(共線 ⇒ 角度差 ≈ 180°)。
        let da = Math.abs(A.ang - B.ang);
        if (da > Math.PI) da = 2 * Math.PI - da;
        if (Math.abs(da - Math.PI) > 0.35) continue;
        if (Math.max(A.dist, B.dist) / Math.min(A.dist, B.dist) > 1.7) continue;

        const tri = [A.m, j, B.m].sort((x, y) => comps[x].cx - comps[y].cx);
        const key = tri.join(',');
        if (seen.has(key)) continue;
        seen.add(key);

        const angleDeg =
          (Math.atan2(comps[tri[2]].cy - comps[tri[0]].cy, comps[tri[2]].cx - comps[tri[0]].cx) * 180) / Math.PI;
        candidates.push({
          idxs: [tri[0], tri[1], tri[2]] as [number, number, number],
          angleDeg,
          cx: (comps[tri[0]].cx + comps[tri[1]].cx + comps[tri[2]].cx) / 3,
          cy: (comps[tri[0]].cy + comps[tri[1]].cy + comps[tri[2]].cy) / 3,
        });
      }
    }
  }
  return candidates;
}

/**
 * 数字チェーンに対応するタイルを選ぶ(BR-7)。
 * 数字はタイルの上方に出るため、タイルのローカル座標系で「上(ly<0)」にあるものを優先し、
 * 該当なしなら最近傍。距離が pairRadiusFactor×タイル高さ を超えたら不成立(-1)。
 */
export function pairChainToTile(
  comps: Component[],
  tileIdx: number[],
  chain: ChainCandidate,
  cfg: PipelineConfig,
): number {
  const th = (chain.angleDeg * Math.PI) / 180;
  const cth = Math.cos(th);
  const sth = Math.sin(th);
  let bestIdx = -1;
  let bestDist = Infinity;
  let nearIdx = -1;
  let nearDist = Infinity;
  for (const i of tileIdx) {
    const comp = comps[i];
    const vx = chain.cx - comp.cx;
    const vy = chain.cy - comp.cy;
    const d = Math.hypot(vx, vy);
    if (d < nearDist) {
      nearDist = d;
      nearIdx = i;
    }
    const lx = cth * vx + sth * vy;
    const ly = -sth * vx + cth * vy;
    if (ly < 0 && Math.abs(lx) < -ly + comp.h && d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  const idx = bestIdx >= 0 ? bestIdx : nearIdx;
  const dist = bestIdx >= 0 ? bestDist : nearDist;
  if (idx < 0) return -1;
  if (dist > cfg.pairRadiusFactor * comps[idx].h) return -1;
  return idx;
}

/**
 * タイル = 内部に暗い文字を「穴」として抱える明るいblob。
 * ボックス境界から暗部をflood fillし、到達しなかった暗部が内包glyph。
 * 複数の内包成分(フレームのリング・八角形の角)からは「中心に近くコンパクトなもの」を選ぶ。
 * letter-locator pipeline.ts extractEnclosedGlyph の移植(スクラッチバッファは呼び出し側管理)。
 */
export class GlyphExtractor {
  private dark = new Uint8Array(0);
  private bg = new Uint8Array(0);
  private stack = new Int32Array(0);
  private label = new Int32Array(0);

  extract(gray: Uint8Array, width: number, threshold: number, tile: Component): TileGlyph | null {
    const bw = tile.w;
    const bh = tile.h;
    const n = bw * bh;
    if (this.dark.length < n) {
      this.dark = new Uint8Array(n);
      this.bg = new Uint8Array(n);
      this.stack = new Int32Array(n);
      this.label = new Int32Array(n);
    }
    const dark = this.dark;
    const bg = this.bg;
    const stack = this.stack;
    const label = this.label;
    for (let i = 0; i < n; i++) {
      dark[i] = 0;
      bg[i] = 0;
      label[i] = 0;
    }

    for (let y = 0; y < bh; y++) {
      const grow = (tile.y0 + y) * width + tile.x0;
      const lrow = y * bw;
      for (let x = 0; x < bw; x++) {
        if (gray[grow + x] <= threshold) dark[lrow + x] = 1;
      }
    }

    // 境界から暗部(壁)を内側へflood fill。
    let sp = 0;
    const pushIf = (p: number) => {
      if (dark[p] === 1 && bg[p] === 0) {
        bg[p] = 1;
        stack[sp++] = p;
      }
    };
    for (let x = 0; x < bw; x++) {
      pushIf(x);
      pushIf((bh - 1) * bw + x);
    }
    for (let y = 0; y < bh; y++) {
      pushIf(y * bw);
      pushIf(y * bw + (bw - 1));
    }
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % bw;
      const py = (p / bw) | 0;
      if (px > 0) pushIf(p - 1);
      if (px < bw - 1) pushIf(p + 1);
      if (py > 0) pushIf(p - bw);
      if (py < bh - 1) pushIf(p + bw);
    }

    // 内包暗部をラベリングし「中央寄り・コンパクト」な成分をglyphとして選ぶ。
    const cxC = bw / 2;
    const cyC = bh / 2;
    const maxSpanW = 0.78 * bw;
    const maxSpanH = 0.78 * bh;
    let bestLabel = -1;
    let bestDist = Infinity;
    let lx0 = 0;
    let ly0 = 0;
    let lw = 0;
    let lh = 0;
    let nextLabel = 0;
    for (let s = 0; s < n; s++) {
      if (dark[s] !== 1 || bg[s] === 1 || label[s] !== 0) continue;
      nextLabel++;
      let sp2 = 0;
      stack[sp2++] = s;
      label[s] = nextLabel;
      let area = 0;
      let sx = 0;
      let sy = 0;
      let minx = bw;
      let maxx = 0;
      let miny = bh;
      let maxy = 0;
      while (sp2 > 0) {
        const p = stack[--sp2];
        const px = p % bw;
        const py = (p / bw) | 0;
        area++;
        sx += px;
        sy += py;
        if (px < minx) minx = px;
        if (px > maxx) maxx = px;
        if (py < miny) miny = py;
        if (py > maxy) maxy = py;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = py + dy;
          if (ny < 0 || ny >= bh) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = px + dx;
            if (nx < 0 || nx >= bw) continue;
            const q = ny * bw + nx;
            if (dark[q] === 1 && bg[q] === 0 && label[q] === 0) {
              label[q] = nextLabel;
              stack[sp2++] = q;
            }
          }
        }
      }
      const cw = maxx - minx + 1;
      const ch = maxy - miny + 1;
      if (area < 6 || cw < 3 || ch < 3) continue;
      if (cw > maxSpanW || ch > maxSpanH) continue; // フレームのリング/八角形の角
      const dist = Math.hypot(sx / area - cxC, sy / area - cyC);
      if (dist < bestDist) {
        bestDist = dist;
        bestLabel = nextLabel;
        lx0 = minx;
        ly0 = miny;
        lw = cw;
        lh = ch;
      }
    }
    if (bestLabel < 0) return null;

    // 正方形窓でアスペクト比を保ちながらグリッド化。ink = 閾値下の暗さ(選択成分のみ)。
    const grid = new Float32Array(GRID * GRID);
    const side = Math.max(lw, lh);
    const ox = lx0 + lw / 2 - side / 2;
    const oy = ly0 + lh / 2 - side / 2;
    const inkScale = 1 / Math.max(threshold * 0.55, 1);
    let sum = 0;
    for (let gy = 0; gy < GRID; gy++) {
      const sy = Math.floor(oy + (gy / GRID) * side);
      const ey = Math.ceil(oy + ((gy + 1) / GRID) * side);
      for (let gx = 0; gx < GRID; gx++) {
        const sx = Math.floor(ox + (gx / GRID) * side);
        const ex = Math.ceil(ox + ((gx + 1) / GRID) * side);
        let acc = 0;
        let count = 0;
        for (let y = sy; y < ey; y++) {
          const inRow = y >= 0 && y < bh;
          const lrow = y * bw;
          const grow = (tile.y0 + y) * width + tile.x0;
          for (let x = sx; x < ex; x++) {
            count++;
            if (!inRow || x < 0 || x >= bw) continue;
            if (label[lrow + x] === bestLabel) {
              const d = threshold - gray[grow + x];
              acc += Math.min(1, d * inkScale);
            }
          }
        }
        const v = count > 0 ? acc / count : 0;
        grid[gy * GRID + gx] = v;
        sum += v;
      }
    }

    return {
      grid,
      sum,
      aspect: lw / lh,
      cx: tile.x0 + lx0 + lw / 2,
      cy: tile.y0 + ly0 + lh / 2,
      local: { x0: lx0, y0: ly0, w: lw, h: lh },
    };
  }
}
