import type { VideoSource } from './types';

/** 背面カメラ(getUserMedia)。HTTPSまたはlocalhostが必要(US-01)。 */
export class CameraSource implements VideoSource {
  readonly kind = 'camera' as const;
  width = 1280;
  height = 720;
  private video = document.createElement('video');
  private stream?: MediaStream;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    await this.video.play();
    let w = this.video.videoWidth || this.width;
    let h = this.video.videoHeight || this.height;
    // 処理解像度の上限: ピクセル単位のパス(gray/binarize/components)が
    // スマホCPUの支配コスト。960幅で数字が読める解像度と処理量のバランスを取る
    // (letter-locator実測値)。表示はCSSで拡大される。
    const MAX_W = 960;
    if (w > MAX_W) {
      h = Math.round((h * MAX_W) / w);
      w = MAX_W;
    }
    this.width = w;
    this.height = h;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.video.srcObject = null;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.drawImage(this.video, 0, 0, this.width, this.height);
  }
}
