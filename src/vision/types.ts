/** 軸平行の矩形(元フレーム座標系)。 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * RGBAピクセル画像。DOMのImageDataと構造的に互換(Node上のテストでは
 * プレーンオブジェクトで代替できるよう、あえて独自インターフェースにする)。
 */
export interface RgbaImage {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** グレースケールフレーム(輝度 0〜255)。 */
export interface GrayFrame {
  data: Uint8Array; // length === width * height
  width: number;
  height: number;
}

/** 連結成分(letter-locator互換の形)。 */
export interface Component {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
  area: number;
  cx: number;
  cy: number;
  label?: number;
}

/** 認識エンジン種別。 */
export type EngineKind = 'template' | 'tesseract';

/** glyph分類結果。 */
export interface Classified {
  ch: string;
  score: number; // 0.0〜1.0
  /** 次点文字とのスコア差。小さいほど曖昧。 */
  margin: number;
}

/** ペア候補 — Unit 2 へ渡す境界エンティティ(BR-1/2/3準拠)。 */
export interface PairCandidate {
  letter: string; // 'A'〜'Z'
  digits: string; // '000'〜'999'(3桁)
  confidence: number; // 0.0〜1.0 = min(letterScore, digitsScore)
  cardBox: Rect; // タイルのバウンディングボックス(元解像度座標)
}

/** 1フレームの解析結果。閾値による採否判定は Unit 2 の責務(BR-4)。 */
export interface RecognitionResult {
  /** ノイズ棄却を通過したペア候補(スコア付き)。 */
  candidates: PairCandidate[];
  /**
   * ペア化まで成立したが分類スコアがノイズ床未満だった候補。
   * Unit 2 の再撮影促し(US-07)の根拠。letterが読めない場合 letter='?'。
   */
  lowConfidence: PairCandidate[];
  /** フレーム内で検出したタイル(カード)数。 */
  cardCount: number;
}

/** 認識エンジン抽象。実装: TemplateRecognizer / TesseractRecognizer。 */
export interface Recognizer {
  readonly kind: EngineKind;
  readonly ready: boolean;
  /** 重い初期化(テンプレート構築 / WASM・言語データロード)。複数回呼んでも安全。 */
  init(): Promise<void>;
  /** 1フレームを解析してペア候補を返す。 */
  recognize(frame: RgbaImage): Promise<RecognitionResult>;
  dispose(): void;
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const DIGITS = '0123456789';

/** BR-1: A〜Zの1文字か。 */
export function isValidLetter(s: string): boolean {
  return s.length === 1 && s >= 'A' && s <= 'Z';
}

/** BR-2: 3桁数字か。 */
export function isValidDigits(s: string): boolean {
  return /^[0-9]{3}$/.test(s);
}
