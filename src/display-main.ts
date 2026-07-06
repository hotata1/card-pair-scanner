/**
 * 表示用シミュレータページ(display.html)。
 * PC等の画面いっぱいにカード盤面を静止表示し、スマホ実機のカメラで
 * 撮影して実カメラ→認識パイプラインをテストできるようにする(US-13の拡張)。
 * 手ブレ・ズームは実カメラの動きが担うため、盤面自体は静止表示(rot/pan/scale固定)。
 */
import { BOARD_H, BOARD_W, createScene, renderScene } from './sim/simulator';

const canvas = document.getElementById('board') as HTMLCanvasElement;
canvas.width = BOARD_W;
canvas.height = BOARD_H;
const ctx = canvas.getContext('2d')!;

// URLで ?seed=123 を指定すると同じ盤面を再現できる(共有・比較用)。
const seedParam = new URLSearchParams(location.search).get('seed');
const items = createScene(seedParam ? mulberrySeed(Number(seedParam)) : Math.random);

function mulberrySeed(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const t0 = performance.now();
function loop(): void {
  const t = (performance.now() - t0) / 1000;
  // 静止ビュー: パン・回転・ズームなし(実カメラの動きで手ブレは再現される)
  renderScene(ctx, items, t, { cx: BOARD_W / 2, cy: BOARD_H / 2, scale: 1, rot: 0 });
  requestAnimationFrame(loop);
}
loop();
