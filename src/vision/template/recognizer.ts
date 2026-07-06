import { DEFAULT_CONFIG, type PipelineConfig } from '../config';
import { findChainCandidates, GlyphExtractor, pairChainToTile, splitByHeight, type ChainCandidate } from '../detect';
import { extractGrid, gridSum } from '../grid';
import { binarize, foregroundRatio, otsuThreshold } from '../preprocess/binarize';
import { ComponentFinder } from '../preprocess/components';
import { toGray } from '../preprocess/gray';
import { FrameScaler } from '../preprocess/scaler';
import type { Classified, Component, PairCandidate, Recognizer, RecognitionResult, RgbaImage } from '../types';
import { isValidDigits, isValidLetter } from '../types';
import { classifyGlyph } from './classify';
import { buildTemplateBank, type GlyphRasterizer, type TemplateBank } from './templates';

const EMPTY: RecognitionResult = { candidates: [], lowConfidence: [], cardCount: 0 };

/** パイプライン診断値(PerfMeter/デバッグ表示用)。 */
export interface TemplateDiagnostics {
  threshold: number;
  compCount: number;
  tileCount: number;
  digitCount: number;
  chainCandidates: number;
  bestLetter: number;
  bestDigit: number;
}

/**
 * テンプレート照合エンジン。前処理→検出(共通層)→Dice照合→ペア化。
 * メインスレッド実行(NFR設計P-1: recognizeはasync契約なのでWorker化時も呼び出し側は不変)。
 */
export class TemplateRecognizer implements Recognizer {
  readonly kind = 'template' as const;
  private bank?: TemplateBank;
  private finder = new ComponentFinder();
  private extractor = new GlyphExtractor();
  private scaler: FrameScaler;
  private gray?: Uint8Array;
  private bin?: Uint8Array;
  private normGray?: Uint8Array;
  diagnostics: TemplateDiagnostics = {
    threshold: 0,
    compCount: 0,
    tileCount: 0,
    digitCount: 0,
    chainCandidates: 0,
    bestLetter: 0,
    bestDigit: 0,
  };

  constructor(
    private rasterizer: GlyphRasterizer,
    private cfg: PipelineConfig = DEFAULT_CONFIG,
  ) {
    this.scaler = new FrameScaler(cfg.maxProcessWidth, cfg.maxProcessHeight);
  }

  get ready(): boolean {
    return this.bank !== undefined;
  }

  async init(): Promise<void> {
    if (this.bank) return;
    this.bank = buildTemplateBank(this.rasterizer);
  }

  dispose(): void {
    this.bank = undefined;
  }

  async recognize(frame: RgbaImage): Promise<RecognitionResult> {
    const bank = this.bank;
    if (!bank) throw new Error('TemplateRecognizer: init() not called');
    const { cfg } = this;
    const d = this.diagnostics;
    d.compCount = d.tileCount = d.digitCount = d.chainCandidates = 0;
    d.bestLetter = d.bestDigit = 0;

    const img = this.scaler.fit(frame);
    const grayFrame = toGray(img, this.gray);
    this.gray = grayFrame.data;
    const threshold = otsuThreshold(grayFrame);
    d.threshold = threshold;
    this.bin = binarize(grayFrame, threshold, this.bin);
    const bin = this.bin;

    // BR-8: 縮退フレームは解析しない。
    const fg = foregroundRatio(bin);
    if (fg < cfg.degenerateForegroundMin || fg > cfg.degenerateForegroundMax) return EMPTY;

    const W = img.width;
    const comps = this.finder.find(bin, W, img.height, cfg);
    d.compCount = comps.length;
    if (comps.length === 0) return EMPTY;

    // 背景減算グレー: 明るい数字glyphのアンチエイリアスを保ちつつ暗い壁をゼロに。
    const gray = grayFrame.data;
    if (!this.normGray || this.normGray.length !== gray.length) {
      this.normGray = new Uint8Array(gray.length);
    }
    const normGray = this.normGray;
    const scale = 255 / Math.max(255 - threshold, 1);
    for (let i = 0; i < gray.length; i++) {
      const v = gray[i];
      normGray[i] = v > threshold ? Math.min(255, (v - threshold) * scale) : 0;
    }

    const { tileIdx, digitIdx } = splitByHeight(comps, cfg.tileDigitRatio);
    d.tileCount = tileIdx.length;
    d.digitCount = digitIdx.length;

    // 数字glyphの分類(成分ごとにメモ化 — 同じ桁が複数候補チェーンで再利用される)。
    const digCls = new Map<number, Classified>();
    const clsOf = (i: number): Classified => {
      let c = digCls.get(i);
      if (c === undefined) {
        const comp = comps[i];
        const grid = extractGrid(normGray, W, comp, 255);
        // 角度ヒントなしで全±54°バンクを1回照合(letter-locator実測でその方が速く安定)。
        c = classifyGlyph(grid, gridSum(grid), comp.w / comp.h, bank, 'digit', undefined, 20);
        digCls.set(i, c);
        if (c.score > d.bestDigit) d.bestDigit = c.score;
      }
      return c;
    };

    // 幾何チェーン候補 → 分類ゲート → スコア降順の貪欲非重複選択。
    const geoChains = findChainCandidates(comps, digitIdx, cfg);
    d.chainCandidates = geoChains.length;
    interface ScoredChain {
      chain: ChainCandidate;
      value: string;
      score: number;
    }
    const scored: ScoredChain[] = [];
    for (const chain of geoChains) {
      const cls = chain.idxs.map((i) => clsOf(i));
      if (cls.some((c) => c.score < cfg.digitScoreMin || c.margin < cfg.digitMarginMin)) continue;
      scored.push({
        chain,
        value: cls.map((c) => c.ch).join(''),
        score: Math.min(cls[0].score, cls[1].score, cls[2].score),
      });
    }
    scored.sort((a, b) => b.score - a.score);
    const used = new Set<number>();
    const chains: ScoredChain[] = [];
    for (const s of scored) {
      if (s.chain.idxs.some((x) => used.has(x))) continue;
      for (const x of s.chain.idxs) used.add(x);
      chains.push(s);
    }

    // ペア化 + タイル文字分類(ペア対象タイルのみ遅延評価)。
    const letterCls = new Map<number, Classified | null>();
    const letterOf = (i: number): Classified | null => {
      if (letterCls.has(i)) return letterCls.get(i)!;
      const g = this.extractor.extract(gray, W, threshold, comps[i]);
      let c: Classified | null = null;
      if (g) {
        c = classifyGlyph(g.grid, g.sum, g.aspect, bank, 'letter');
        if (c.score > d.bestLetter) d.bestLetter = c.score;
      }
      letterCls.set(i, c);
      return c;
    };

    const candidates: PairCandidate[] = [];
    const lowConfidence: PairCandidate[] = [];
    for (const { chain, value, score } of chains) {
      const tileI = pairChainToTile(comps, tileIdx, chain, cfg);
      if (tileI < 0) continue; // BR-7: 対応タイルなし → 不成立
      const tile = comps[tileI];
      const cardBox = this.scaler.unscaleRect(boxOf(tile));
      const letter = letterOf(tileI);
      const digitsOk = isValidDigits(value);
      if (!digitsOk) continue;
      if (letter && isValidLetter(letter.ch) && letter.score >= cfg.letterScoreMin && letter.margin >= cfg.letterMarginMin) {
        candidates.push({
          letter: letter.ch,
          digits: value,
          confidence: Math.min(letter.score, score), // BR-3
          cardBox,
        });
      } else {
        // ペア化までは成立したが文字が読めない/曖昧 → 再撮影促しの根拠(US-07)。
        lowConfidence.push({
          letter: letter && isValidLetter(letter.ch) ? letter.ch : '?',
          digits: value,
          confidence: Math.min(letter?.score ?? 0, score),
          cardBox,
        });
      }
    }

    return { candidates, lowConfidence, cardCount: tileIdx.length };
  }
}

function boxOf(c: Component): { x: number; y: number; w: number; h: number } {
  return { x: c.x0, y: c.y0, w: c.w, h: c.h };
}
