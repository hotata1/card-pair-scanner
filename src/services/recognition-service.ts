import type { RecordStore, PairRecord } from '../state/record-store';
import type { EngineRegistry } from '../vision/registry';
import type { EngineKind, PairCandidate, Recognizer, RgbaImage } from '../vision/types';

/** 1フレーム処理の結果(UI更新の入力)。 */
export interface FrameOutcome {
  /** このフレームで新規に記録されたレコード。 */
  added: PairRecord[];
  /** 閾値を超えた候補全体(オーバーレイの緑枠用。重複含む)。 */
  accepted: PairCandidate[];
  /** 閾値未満+Unit 1のlowConfidence(黄枠・インジケータ用)。 */
  lowConfidence: PairCandidate[];
  /** 既存キーと重複したため記録しなかった件数。 */
  duplicates: number;
  cardCount: number;
}

/**
 * RecognitionService: 閾値判定(BR-U2-1)→ 記録(BR-U2-2)のフロー調整。
 * Unit 1 はスコア付き候補を返すだけで、採否はここで決まる(BR-4)。
 */
export class RecognitionService {
  private recognizer?: Recognizer;
  private threshold: number;

  constructor(
    private registry: EngineRegistry,
    private recordStore: RecordStore,
    initialThreshold: number,
  ) {
    this.threshold = initialThreshold;
  }

  setConfidenceThreshold(value: number): void {
    this.threshold = value;
  }

  get engineKind(): EngineKind | undefined {
    return this.recognizer?.kind;
  }

  /** エンジン切替。フォールバックが起きた場合は理由を返す(UI通知用)。 */
  async setEngine(kind: EngineKind): Promise<string | undefined> {
    const sel = await this.registry.select(kind);
    this.recognizer = sel.recognizer;
    return sel.fallbackReason;
  }

  /** 1フレームを処理する。呼び出しは直列化される前提(BR-U2-10はCaptureController側)。 */
  async processFrame(frame: RgbaImage): Promise<FrameOutcome> {
    if (!this.recognizer) throw new Error('RecognitionService: engine not selected');
    const result = await this.recognizer.recognize(frame);

    const accepted: PairCandidate[] = [];
    const lowConfidence: PairCandidate[] = [...result.lowConfidence];
    const added: PairRecord[] = [];
    let duplicates = 0;

    for (const c of result.candidates) {
      if (c.confidence >= this.threshold) {
        accepted.push(c);
        if (this.recordStore.add(c, this.recognizer.kind)) {
          const rec = this.recordStore.getAll().find((r) => r.id === `${c.letter}-${c.digits}`);
          if (rec) added.push(rec);
        } else {
          duplicates++;
        }
      } else {
        // 閾値未満はUnit 1のlowConfidenceと同じ扱い(再撮影促しの根拠)
        lowConfidence.push(c);
      }
    }

    return { added, accepted, lowConfidence, duplicates, cardCount: result.cardCount };
  }
}
