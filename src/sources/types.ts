/** 映像ソース抽象 — 実カメラ/シミュレータを同一契約で扱う(US-13/FR-4.2)。 */
export interface VideoSource {
  readonly kind: 'camera' | 'simulator';
  readonly width: number;
  readonly height: number;
  start(): Promise<void>;
  stop(): void;
  /** 現在のフレームを与えられたコンテキストへ描画する(canvasは width×height)。 */
  draw(ctx: CanvasRenderingContext2D): void;
}
