/**
 * パイプライン調整パラメータ。初期値は letter-locator の実測調整値を踏襲
 * (aidlc-docs/construction/recognition-core/functional-design/business-rules.md)。
 */
export interface PipelineConfig {
  /** 連結成分フィルタ。 */
  minArea: number;
  minDim: number;
  maxDim: number;
  /** ノイズ床: これ未満のglyphスコアは lowConfidence 行き。 */
  digitScoreMin: number;
  letterScoreMin: number;
  /** 次点との最小スコア差。曖昧な読みは捨てる。 */
  digitMarginMin: number;
  letterMarginMin: number;
  /** 数字チェーン: 桁中心間の最大距離(桁高さ比)。 */
  chainGapFactor: number;
  /** ペア化: 数字→タイルの最大距離(タイル高さ比)。 */
  pairRadiusFactor: number;
  /** タイルは数字よりこの倍率以上大きい(高さ比の二峰分離に使用)。 */
  tileDigitRatio: number;
  /** 縮退フレーム判定(BR-8): 前景率がこの範囲外なら解析スキップ。 */
  degenerateForegroundMin: number;
  degenerateForegroundMax: number;
  /** 処理解像度の上限(U1-NFR-P2)。 */
  maxProcessWidth: number;
  maxProcessHeight: number;
}

export const DEFAULT_CONFIG: PipelineConfig = {
  minArea: 10,
  minDim: 4,
  maxDim: 200,
  digitScoreMin: 0.42,
  letterScoreMin: 0.4,
  digitMarginMin: 0.012,
  letterMarginMin: 0.008,
  chainGapFactor: 1.6,
  pairRadiusFactor: 2.2,
  tileDigitRatio: 1.6,
  degenerateForegroundMin: 0.001,
  degenerateForegroundMax: 0.6,
  maxProcessWidth: 1280,
  maxProcessHeight: 720,
};
