import { DEFAULT_CONFIG, type PipelineConfig } from '../config';
import { FrameScaler } from '../preprocess/scaler';
import type { PairCandidate, Rect, Recognizer, RecognitionResult, RgbaImage } from '../types';
import { isValidDigits, isValidLetter } from '../types';

interface ApiCandidate {
  letter: string;
  digits: string;
  confidence: number;
  cardBox: Rect;
}

interface ApiResponse {
  candidates: ApiCandidate[];
  lowConfidence: ApiCandidate[];
  cardCount: number;
}

/**
 * AwsRecognizer: Lambda(Amazon Rekognition DetectText)経由の認識エンジン。
 * 認証(Cognito JWT)はAPI Gateway側のAuthorizerで完結するため、ここでは
 * 呼び出し元から渡される有効なアクセストークンを都度Authorizationヘッダに載せるだけ。
 */
export class AwsRecognizer implements Recognizer {
  readonly kind = 'aws' as const;
  private scaler: FrameScaler;
  private canvas: HTMLCanvasElement;
  private initialized = false;

  constructor(
    private endpoint: string,
    private getAccessToken: () => Promise<string | null>,
    cfg: PipelineConfig = DEFAULT_CONFIG,
  ) {
    this.scaler = new FrameScaler(cfg.maxProcessWidth, cfg.maxProcessHeight);
    this.canvas = document.createElement('canvas');
  }

  get ready(): boolean {
    return this.initialized;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    const token = await this.getAccessToken();
    if (!token) throw new Error('AwsRecognizer: ログインが必要です');
    // Rekognitionを呼ばない疎通確認(コストゼロ)。認証切れ・エンドポイント不通もここで検出。
    const res = await this.post(token, { ping: true });
    if (!res.ok) throw new Error(`AwsRecognizer: 疎通確認に失敗しました(${res.status})`);
    this.initialized = true;
  }

  dispose(): void {
    this.initialized = false;
  }

  async recognize(frame: RgbaImage): Promise<RecognitionResult> {
    if (!this.initialized) throw new Error('AwsRecognizer: init() not called');
    const token = await this.getAccessToken();
    if (!token) throw new Error('AwsRecognizer: ログインが必要です');

    const img = this.scaler.fit(frame);
    const image = this.encodeJpeg(img);

    const res = await this.post(token, { image, width: img.width, height: img.height });
    if (!res.ok) throw new Error(`AwsRecognizer: 認識に失敗しました(${res.status})`);
    const data = (await res.json()) as ApiResponse;

    const toCandidate = (c: ApiCandidate): PairCandidate => ({
      letter: c.letter,
      digits: c.digits,
      confidence: c.confidence,
      cardBox: this.scaler.unscaleRect(c.cardBox),
    });

    return {
      candidates: data.candidates.filter((c) => isValidLetter(c.letter) && isValidDigits(c.digits)).map(toCandidate),
      lowConfidence: data.lowConfidence.map(toCandidate),
      cardCount: data.cardCount,
    };
  }

  private post(token: string, body: unknown): Promise<Response> {
    return fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  }

  /** 処理解像度のRGBAフレームをJPEG(base64, データURLのヘッダ抜き)に変換。 */
  private encodeJpeg(img: RgbaImage): string {
    this.canvas.width = img.width;
    this.canvas.height = img.height;
    const ctx = this.canvas.getContext('2d')!;
    ctx.putImageData(new ImageData(img.data, img.width, img.height), 0, 0);
    const dataUrl = this.canvas.toDataURL('image/jpeg', 0.85);
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }
}
