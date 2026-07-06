import type { FrameOutcome } from '../services/recognition-service';
import type { RgbaImage } from '../vision/types';
import { el } from './dom';

/**
 * CameraView: プレビュー(rAFで映像ソースを連続描画)+検出オーバーレイ+許可拒否案内。
 * 認識用フレームはプレビューと同じcanvasから取得する(表示と認識のズレをなくす)。
 */
export class CameraView {
  readonly root: HTMLElement;
  private frameCanvas: HTMLCanvasElement;
  private overlayCanvas: HTMLCanvasElement;
  private frameCtx: CanvasRenderingContext2D;
  private overlayCtx: CanvasRenderingContext2D;
  private notice: HTMLElement;
  private rafId = 0;
  private drawSource: ((ctx: CanvasRenderingContext2D) => void) | null = null;

  constructor() {
    this.frameCanvas = el('canvas', { testId: 'camera-view-frame-canvas' });
    this.overlayCanvas = el('canvas', { testId: 'camera-view-overlay-canvas' });
    this.notice = el('div', { className: 'permission-notice', testId: 'camera-view-permission-notice' });
    this.notice.style.display = 'none';
    this.root = el('div', { className: 'camera-view' }, this.frameCanvas, this.overlayCanvas, this.notice);
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true })!;
    this.overlayCtx = this.overlayCanvas.getContext('2d')!;
  }

  /** ソース切替時に呼ぶ。プレビューループを開始する。 */
  attachSource(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    this.frameCanvas.width = width;
    this.frameCanvas.height = height;
    this.overlayCanvas.width = width;
    this.overlayCanvas.height = height;
    this.drawSource = draw;
    this.hideNotice();
    if (this.rafId === 0) this.loop();
  }

  detachSource(): void {
    this.drawSource = null;
  }

  private loop = (): void => {
    if (this.drawSource) {
      try {
        this.drawSource(this.frameCtx);
      } catch {
        // ソース停止直後などの一時的な失敗は無視(次フレームで回復)
      }
    }
    this.rafId = requestAnimationFrame(this.loop);
  };

  /** 現在のプレビューフレームを認識用に取得。 */
  grabFrame(): RgbaImage | null {
    if (!this.drawSource || this.frameCanvas.width === 0) return null;
    return this.frameCtx.getImageData(0, 0, this.frameCanvas.width, this.frameCanvas.height);
  }

  /** 検出結果のオーバーレイ描画(緑=採用、黄=読めていない)。 */
  renderOverlay(outcome: FrameOutcome): void {
    const ctx = this.overlayCtx;
    ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    ctx.lineWidth = 3;
    ctx.font = 'bold 16px ui-monospace, monospace';
    for (const c of outcome.accepted) {
      ctx.strokeStyle = '#4caf50';
      ctx.strokeRect(c.cardBox.x, c.cardBox.y, c.cardBox.w, c.cardBox.h);
      ctx.fillStyle = '#4caf50';
      ctx.fillText(`${c.letter}-${c.digits}`, c.cardBox.x, c.cardBox.y - 6);
    }
    for (const c of outcome.lowConfidence) {
      ctx.strokeStyle = '#ffa726';
      ctx.strokeRect(c.cardBox.x, c.cardBox.y, c.cardBox.w, c.cardBox.h);
    }
  }

  /** カメラ許可拒否などの案内(平易な日本語: US-01)。 */
  showNotice(message: string, actions: { label: string; testId: string; onClick: () => void }[]): void {
    this.notice.replaceChildren(
      el('div', { text: message }),
      el(
        'div',
        { className: 'actions' },
        ...actions.map((a) => el('button', { text: a.label, testId: a.testId, onClick: a.onClick })),
      ),
    );
    this.notice.style.display = 'flex';
  }

  hideNotice(): void {
    this.notice.style.display = 'none';
  }
}
