import { BOARD_H, BOARD_W, createScene, renderScene, seededRng, type SimItem, type SimView } from '../sim/simulator';
import type { VideoSource } from './types';

/**
 * シミュレータソース: 仮想モニター(点滅数字付きタイル群)を手持ちカメラ風の
 * 揺れ・ズーム・傾きで描画する。実機なしで全パイプラインを検証できる(US-13)。
 */
export class SimulatorSource implements VideoSource {
  readonly kind = 'simulator' as const;
  readonly width = 1280;
  readonly height = 720;
  readonly items: SimItem[];
  private t0 = 0;
  /** 直近describeフレームの時刻(秒)とビュー(精度ハーネスの真値突合用)。 */
  lastT = 0;
  lastView: SimView = { cx: BOARD_W / 2, cy: BOARD_H / 2, scale: 1, rot: 0 };

  constructor(seed?: number) {
    this.items = createScene(seed !== undefined ? seededRng(seed) : Math.random);
  }

  async start(): Promise<void> {
    this.t0 = performance.now();
  }

  stop(): void {}

  draw(ctx: CanvasRenderingContext2D): void {
    const t = (performance.now() - this.t0) / 1000;
    const view: SimView = {
      cx: BOARD_W / 2 + Math.sin(t * 0.5) * 28 + Math.sin(t * 1.7) * 7,
      cy: BOARD_H / 2 + Math.cos(t * 0.4) * 20 + Math.sin(t * 2.3) * 6,
      scale: (this.height / BOARD_H) * (1.0 + 0.04 * Math.sin(t * 0.23)),
      rot: 0.03 * Math.sin(t * 0.31),
    };
    renderScene(ctx, this.items, t, view);
    this.lastT = t;
    this.lastView = view;
  }
}
