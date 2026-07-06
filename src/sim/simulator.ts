/**
 * テスト用シミュレータ — letter-locator src/sim/simulator.ts の移植。
 * 実対象と同じ「モニター表示+点滅する3桁数字」を再現する(機能設計Q4: C)。
 * 変更点: 乱数をシード注入可能にした(BR-10/P8: テスト再現性)。
 */
import { LETTERS } from '../vision/types';

/**
 * シミュレータの表示フォント。認識側テンプレートのフォントとは意図的に
 * 不一致にしてある(実表示フォント未知の状況を再現し、フォント頑健性を測る)。
 */
export const SIM_FONT_FAMILY = 'Verdana, Geneva, sans-serif';

export const BOARD_W = 1280;
export const BOARD_H = 720;
export const TILE_PX = 48;
export const LETTER_PX = 31;
export const DIGIT_PX = 18;
export const ITEM_COUNT = 77;

export type TileShape = 'octagon';
const SHAPES: TileShape[] = ['octagon'];

export interface SimItem {
  letter: string;
  number: string;
  x: number;
  y: number;
  angle: number;
  shape: TileShape;
  /** 数字の点滅周期(秒)。 */
  period: number;
  phase: number;
  duty: number;
}

const COLS = 11;
const ROWS = 7;

/** mulberry32 — シード付き軽量PRNG(P8: 同一シード→同一シーン)。 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 77タイルをジッタ付きグリッドに配置。各タイルは白八角形+中央の暗い文字+
 * 右上で点滅する一意な3桁数字(実際のエスケープルームの壁を模す)。
 */
export function createScene(rng: () => number = Math.random): SimItem[] {
  const nums = new Set<string>();
  while (nums.size < ITEM_COUNT) {
    nums.add(String(Math.floor(rng() * 1000)).padStart(3, '0'));
  }
  const numbers = [...nums];

  const marginX = 80;
  const marginY = 60;
  const cellW = (BOARD_W - marginX * 2) / (COLS - 1);
  const cellH = (BOARD_H - marginY * 2) / (ROWS - 1);

  const items: SimItem[] = [];
  for (let r = 0; r < ROWS && items.length < ITEM_COUNT; r++) {
    for (let c = 0; c < COLS && items.length < ITEM_COUNT; c++) {
      const period = 7 + rng() * 4;
      const onTime = NUM_EMERGE + NUM_HOLD + NUM_HIDE;
      items.push({
        letter: LETTERS[Math.floor(rng() * LETTERS.length)],
        number: numbers[items.length],
        x: marginX + c * cellW + (rng() - 0.5) * cellW * 0.12,
        y: marginY + r * cellH + (rng() - 0.5) * cellH * 0.12,
        angle: ((rng() * 2 - 1) * 30 * Math.PI) / 180,
        shape: SHAPES[Math.floor(rng() * SHAPES.length)],
        period,
        phase: rng() * period,
        duty: onTime / period,
      });
    }
  }
  return items;
}

/** 数字アニメーションのタイミング(秒): 出現→保持→退場。 */
export const NUM_EMERGE = 2;
export const NUM_HOLD = 1.2;
export const NUM_HIDE = 2;

/** 点滅数字のエンベロープ(alpha + slide)。alpha 0 = 完全消灯。 */
export function numberEnvelope(item: SimItem, tSec: number): { alpha: number; slide: number } {
  const u = (tSec + item.phase) % item.period;
  if (u < NUM_EMERGE) {
    const p = u / NUM_EMERGE;
    return { alpha: p, slide: p };
  }
  if (u < NUM_EMERGE + NUM_HOLD) return { alpha: 1, slide: 1 };
  if (u < NUM_EMERGE + NUM_HOLD + NUM_HIDE) {
    const p = (u - NUM_EMERGE - NUM_HOLD) / NUM_HIDE;
    return { alpha: 1 - p, slide: 1 - p };
  }
  return { alpha: 0, slide: 0 };
}

export interface SimView {
  cx: number;
  cy: number;
  scale: number;
  rot: number;
}

function squarePath(ctx: CanvasRenderingContext2D, s: number): void {
  const h = s / 2;
  const r = s * 0.16;
  ctx.beginPath();
  ctx.moveTo(-h + r, -h);
  ctx.arcTo(h, -h, h, h, r);
  ctx.arcTo(h, h, -h, h, r);
  ctx.arcTo(-h, h, -h, -h, r);
  ctx.arcTo(-h, -h, h, -h, r);
  ctx.closePath();
}

function octagonPath(ctx: CanvasRenderingContext2D, s: number): void {
  const h = s / 2;
  const k = h * 0.42;
  ctx.beginPath();
  ctx.moveTo(-k, -h);
  ctx.lineTo(k, -h);
  ctx.lineTo(h, -k);
  ctx.lineTo(h, k);
  ctx.lineTo(k, h);
  ctx.lineTo(-k, h);
  ctx.lineTo(-h, k);
  ctx.lineTo(-h, -k);
  ctx.closePath();
}

export function renderScene(
  ctx: CanvasRenderingContext2D,
  items: SimItem[],
  tSec: number,
  view: SimView,
): void {
  const { width, height } = ctx.canvas;
  ctx.fillStyle = '#0d110d';
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(view.rot);
  ctx.scale(view.scale, view.scale);
  ctx.translate(-view.cx, -view.cy);

  for (const item of items) {
    ctx.save();
    ctx.translate(item.x, item.y);
    ctx.rotate(item.angle);

    const frame = TILE_PX * 1.16;
    ctx.strokeStyle = '#c8d0c8';
    ctx.lineWidth = 2;
    squarePath(ctx, frame);
    ctx.stroke();
    squarePath(ctx, frame - 6);
    ctx.stroke();

    ctx.fillStyle = '#eef1ec';
    octagonPath(ctx, TILE_PX);
    ctx.fill();

    ctx.fillStyle = '#15170f';
    ctx.font = `${LETTER_PX}px ${SIM_FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.letter, 0, 1);

    const env = numberEnvelope(item, tSec);
    if (env.alpha > 0.04) {
      ctx.save();
      ctx.globalAlpha = env.alpha;
      ctx.fillStyle = '#c9d2c4';
      ctx.font = `bold ${DIGIT_PX}px ${SIM_FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const advance = DIGIT_PX * 0.92;
      const restY = -(frame * 0.5 + DIGIT_PX * 0.8);
      const tuckY = -frame * 0.28;
      const baseY = tuckY + (restY - tuckY) * env.slide;
      for (let d = 0; d < item.number.length; d++) {
        ctx.fillText(item.number[d], (d - 1) * advance, baseY);
      }
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();
}
