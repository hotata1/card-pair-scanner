/**
 * AccuracyHarness(LC-3): シミュレータのシーン真値と認識結果を突合し、
 * 再現率・誤検出数を算出する(P9 Oracle)。突合ロジックは純粋関数(Nodeテスト可)。
 */
import { numberEnvelope, type SimItem } from '../sim/simulator';
import type { PairCandidate } from '../vision/types';

export interface AccuracyReport {
  /** その時刻に点灯していた(読み取り可能だった)真値ペア数。 */
  litTruth: number;
  /** 検出ペアのうち真値(全タイル)と一致した数。 */
  correct: number;
  /** 真値のどのタイルとも一致しない検出(誤検出)。 */
  falsePairs: PairCandidate[];
  /** 点灯真値に対する再現率(0〜1)。litTruth=0 のときは null。 */
  recall: number | null;
}

/** alpha がこの値以上なら「点灯中(読める)」とみなす。 */
const LIT_ALPHA = 0.85;

/** 検出ペア候補群をシーン真値と突合する。 */
export function scoreAgainstTruth(
  candidates: PairCandidate[],
  items: SimItem[],
  tSec: number,
): AccuracyReport {
  const truth = new Set(items.map((i) => `${i.letter}-${i.number}`));
  const lit = items.filter((i) => numberEnvelope(i, tSec).alpha >= LIT_ALPHA);
  const litSet = new Set(lit.map((i) => `${i.letter}-${i.number}`));

  let correct = 0;
  let litHit = 0;
  const falsePairs: PairCandidate[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.letter}-${c.digits}`;
    if (seen.has(key)) continue; // 同一フレーム内の重複は1回だけ数える
    seen.add(key);
    if (truth.has(key)) {
      correct++;
      if (litSet.has(key)) litHit++;
    } else {
      falsePairs.push(c);
    }
  }

  return {
    litTruth: lit.length,
    correct,
    falsePairs,
    recall: lit.length > 0 ? litHit / lit.length : null,
  };
}

/** 複数フレーム分のレポートを集計する。 */
export function aggregateReports(reports: AccuracyReport[]): {
  frames: number;
  meanRecall: number | null;
  totalFalse: number;
} {
  const withLit = reports.filter((r) => r.recall !== null);
  const meanRecall =
    withLit.length > 0 ? withLit.reduce((s, r) => s + (r.recall as number), 0) / withLit.length : null;
  return {
    frames: reports.length,
    meanRecall,
    totalFalse: reports.reduce((s, r) => s + r.falsePairs.length, 0),
  };
}
