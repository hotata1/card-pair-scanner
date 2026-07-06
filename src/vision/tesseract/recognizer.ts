import { createWorker, PSM, type Worker } from 'tesseract.js';
import { DEFAULT_CONFIG, type PipelineConfig } from '../config';
import { findChainCandidates, GlyphExtractor, pairChainToTile, splitByHeight } from '../detect';
import { binarize, foregroundRatio, otsuThreshold } from '../preprocess/binarize';
import { ComponentFinder } from '../preprocess/components';
import { toGray } from '../preprocess/gray';
import { FrameScaler } from '../preprocess/scaler';
import type { Component, PairCandidate, Recognizer, RecognitionResult, RgbaImage } from '../types';
import { isValidDigits, isValidLetter } from '../types';

const EMPTY: RecognitionResult = { candidates: [], lowConfidence: [], cardCount: 0 };

/**
 * Tesseract.js 比較エンジン(設計Q1: C)。検出・ペア化は共通層を使い、
 * glyph分類(文字1字 / 3桁チェーン)だけをOCRに置き換える。
 * アセットは public/tesseract/ に同梱(U1-NFR-A1: 外部CDN不使用)。
 * ブラウザ専用(Canvas使用)。処理時間目標の対象外(U1-NFR-P4)。
 */
export class TesseractRecognizer implements Recognizer {
  readonly kind = 'tesseract' as const;
  private letterWorker?: Worker;
  private digitWorker?: Worker;
  private finder = new ComponentFinder();
  private extractor = new GlyphExtractor();
  private scaler: FrameScaler;
  private patch: HTMLCanvasElement;

  constructor(
    private baseUrl: string = import.meta.env.BASE_URL,
    private cfg: PipelineConfig = DEFAULT_CONFIG,
  ) {
    this.scaler = new FrameScaler(cfg.maxProcessWidth, cfg.maxProcessHeight);
    this.patch = document.createElement('canvas');
  }

  get ready(): boolean {
    return this.letterWorker !== undefined && this.digitWorker !== undefined;
  }

  async init(): Promise<void> {
    if (this.ready) return;
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    // Worker内のimportScriptsは相対URLを解決できないため絶対URLにする
    const abs = (p: string): string => new URL(p, window.location.href).toString();
    const opts = {
      workerPath: abs(`${base}tesseract/worker.min.js`),
      corePath: abs(`${base}tesseract/`),
      langPath: abs(`${base}tesseract/`),
      gzip: true,
    };
    const mk = async (whitelist: string, psm: PSM): Promise<Worker> => {
      const w = await createWorker('eng', 1, opts);
      await w.setParameters({
        tessedit_char_whitelist: whitelist,
        tessedit_pageseg_mode: psm,
      });
      return w;
    };
    // 文字用(1文字)と数字用(1行)でPSM・ホワイトリストを分ける。
    this.letterWorker = await mk('ABCDEFGHIJKLMNOPQRSTUVWXYZ', PSM.SINGLE_CHAR);
    this.digitWorker = await mk('0123456789', PSM.SINGLE_LINE);
  }

  dispose(): void {
    void this.letterWorker?.terminate();
    void this.digitWorker?.terminate();
    this.letterWorker = undefined;
    this.digitWorker = undefined;
  }

  async recognize(frame: RgbaImage): Promise<RecognitionResult> {
    if (!this.letterWorker || !this.digitWorker) {
      throw new Error('TesseractRecognizer: init() not called');
    }
    const { cfg } = this;
    const img = this.scaler.fit(frame);
    const grayFrame = toGray(img);
    const threshold = otsuThreshold(grayFrame);
    const bin = binarize(grayFrame, threshold);
    const fg = foregroundRatio(bin);
    if (fg < cfg.degenerateForegroundMin || fg > cfg.degenerateForegroundMax) return EMPTY;

    const W = img.width;
    const comps = this.finder.find(bin, W, img.height, cfg);
    if (comps.length === 0) return EMPTY;

    const { tileIdx, digitIdx } = splitByHeight(comps, cfg.tileDigitRatio);

    // 幾何チェーン候補(共通層) → 3桁まとめてOCR。重複させない貪欲選択は
    // OCR結果の confidence 降順で行う。
    const geoChains = findChainCandidates(comps, digitIdx, cfg);
    interface OcrChain {
      idxs: [number, number, number];
      cx: number;
      cy: number;
      angleDeg: number;
      value: string;
      score: number;
    }
    const ocrChains: OcrChain[] = [];
    for (const chain of geoChains) {
      const members = chain.idxs.map((i) => comps[i]);
      const read = await this.ocrChain(grayFrame.data, W, threshold, members);
      if (!read || !isValidDigits(read.text)) continue;
      ocrChains.push({ ...chain, value: read.text, score: read.confidence });
    }
    ocrChains.sort((a, b) => b.score - a.score);
    const used = new Set<number>();
    const chains: OcrChain[] = [];
    for (const c of ocrChains) {
      if (c.idxs.some((x) => used.has(x))) continue;
      for (const x of c.idxs) used.add(x);
      chains.push(c);
    }

    const candidates: PairCandidate[] = [];
    const lowConfidence: PairCandidate[] = [];
    for (const chain of chains) {
      const tileI = pairChainToTile(comps, tileIdx, chain, cfg);
      if (tileI < 0) continue;
      const tile = comps[tileI];
      const cardBox = this.scaler.unscaleRect({ x: tile.x0, y: tile.y0, w: tile.w, h: tile.h });
      const letter = await this.ocrLetter(grayFrame.data, W, threshold, tile);
      if (letter && isValidLetter(letter.text) && letter.confidence >= cfg.letterScoreMin) {
        candidates.push({
          letter: letter.text,
          digits: chain.value,
          confidence: Math.min(letter.confidence, chain.score), // BR-3/BR-9共通スケール
          cardBox,
        });
      } else {
        lowConfidence.push({
          letter: letter && isValidLetter(letter.text) ? letter.text : '?',
          digits: chain.value,
          confidence: Math.min(letter?.confidence ?? 0, chain.score),
          cardBox,
        });
      }
    }

    return { candidates, lowConfidence, cardCount: tileIdx.length };
  }

  /** タイル内包glyph(暗い文字)を白黒パッチ化してOCR。 */
  private async ocrLetter(
    gray: Uint8Array,
    width: number,
    threshold: number,
    tile: Component,
  ): Promise<{ text: string; confidence: number } | null> {
    const g = this.extractor.extract(gray, width, threshold, tile);
    if (!g) return null;
    const { x0, y0, w, h } = g.local;
    // OCRには余白付きの拡大2値パッチが有効。黒文字/白地に反転して渡す。
    const canvas = this.drawPatch(gray, width, tile.x0 + x0, tile.y0 + y0, w, h, threshold, 'dark');
    const res = await this.letterWorker!.recognize(canvas);
    return { text: res.data.text.trim().toUpperCase(), confidence: normConf(res.data.confidence) };
  }

  /** 3桁チェーンをまとめて1行OCR。 */
  private async ocrChain(
    gray: Uint8Array,
    width: number,
    threshold: number,
    members: Component[],
  ): Promise<{ text: string; confidence: number } | null> {
    const x0 = Math.min(...members.map((c) => c.x0));
    const y0 = Math.min(...members.map((c) => c.y0));
    const x1 = Math.max(...members.map((c) => c.x1));
    const y1 = Math.max(...members.map((c) => c.y1));
    const canvas = this.drawPatch(gray, width, x0, y0, x1 - x0 + 1, y1 - y0 + 1, threshold, 'bright');
    const res = await this.digitWorker!.recognize(canvas);
    const text = res.data.text.replace(/\s+/g, '');
    return { text, confidence: normConf(res.data.confidence) };
  }

  /**
   * グレー画像の部分領域を、黒glyph/白地・4倍拡大・余白付きのパッチに描く。
   * polarity 'dark' = 暗いglyphを黒に、'bright' = 明るいglyphを黒に(反転)。
   */
  private drawPatch(
    gray: Uint8Array,
    width: number,
    x: number,
    y: number,
    w: number,
    h: number,
    threshold: number,
    polarity: 'dark' | 'bright',
  ): HTMLCanvasElement {
    const scale = 4;
    const pad = 8;
    const canvas = this.patch;
    canvas.width = w * scale + pad * 2;
    canvas.height = h * scale + pad * 2;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000';
    for (let yy = 0; yy < h; yy++) {
      const row = (y + yy) * width;
      for (let xx = 0; xx < w; xx++) {
        const v = gray[row + x + xx];
        const isInk = polarity === 'dark' ? v <= threshold : v > threshold;
        if (isInk) ctx.fillRect(pad + xx * scale, pad + yy * scale, scale, scale);
      }
    }
    return canvas;
  }
}

/** Tesseractのconfidence(0〜100)を共通スケール0〜1へ(BR-9)。 */
function normConf(c: number): number {
  return Math.max(0, Math.min(1, c / 100));
}
