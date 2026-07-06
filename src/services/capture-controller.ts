import type { RgbaImage } from '../vision/types';
import type { FrameOutcome, RecognitionService } from './recognition-service';

/**
 * CaptureController: 自動連続撮影(US-04)+手動シャッター(US-05)。
 * - ループは「処理完了後に次タイマーを予約」方式(処理が間隔より遅い端末で詰まらない)
 * - 認識処理は常に直列(BR-U2-10): 手動シャッターも同じキューに乗る
 * - フレーム例外はフレーム単位で隔離しループ継続(R-2)
 * DOM非依存(フレーム取得は注入)— Nodeテスト可能。
 */
export class CaptureController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private running = false;
  private bursting = false;
  private intervalMs: number;

  constructor(
    private grabFrame: () => RgbaImage | null,
    private service: RecognitionService,
    initialIntervalMs: number,
    private onOutcome: (outcome: FrameOutcome) => void,
    private onError: (err: unknown) => void = (err) => console.error('frame failed:', err),
  ) {
    this.intervalMs = initialIntervalMs;
  }

  get autoRunning(): boolean {
    return this.running;
  }

  /** 自動撮影開始(BR-U2-9: 明示操作からのみ呼ばれる)。 */
  startAuto(): void {
    if (this.running) return;
    this.running = true;
    this.scheduleNext(0);
  }

  stopAuto(): void {
    this.running = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /** 次回以降の自動撮影に適用(US-04)。 */
  setInterval(ms: number): void {
    this.intervalMs = ms;
  }

  /** 手動シャッター。自動モードのON/OFFに関わらず使用可(US-05)。 */
  captureOnce(): Promise<void> {
    return this.enqueue();
  }

  get burstRunning(): boolean {
    return this.bursting;
  }

  /**
   * 連写撮影: spanMs の間に count 枚を等間隔で撮影する(既定 8枚/4秒)。
   * 数字は点滅するため、1枚では消灯中のペアを拾えない — 点滅周期をまたぐ
   * 連写で取りこぼしを減らす(FR-2.6の実カメラ対応)。
   */
  async captureBurst(
    count = 8,
    spanMs = 4000,
    onProgress?: (done: number, total: number) => void,
  ): Promise<void> {
    if (this.bursting) return; // 連写中の多重起動は無視
    this.bursting = true;
    const gap = count > 1 ? spanMs / (count - 1) : 0;
    try {
      for (let i = 0; i < count; i++) {
        const t0 = Date.now();
        await this.enqueue();
        onProgress?.(i + 1, count);
        const remain = gap - (Date.now() - t0);
        if (i < count - 1 && remain > 0) {
          await new Promise((r) => setTimeout(r, remain));
        }
      }
    } finally {
      this.bursting = false;
    }
  }

  private scheduleNext(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => {
      void this.enqueue().finally(() => this.scheduleNext(this.intervalMs));
    }, delay);
  }

  /** 直列化キュー: 前の認識が終わってから次を実行する。 */
  private enqueue(): Promise<void> {
    this.queue = this.queue.then(async () => {
      try {
        const frame = this.grabFrame();
        if (!frame) return;
        const outcome = await this.service.processFrame(frame);
        this.onOutcome(outcome);
      } catch (err) {
        this.onError(err);
      }
    });
    return this.queue;
  }
}
