/**
 * PBT用ドメインジェネレータ(PBT-07準拠: 生のプリミティブではなくドメイン制約を持つArbitrary)。
 * 複数テストで共有する(重複定義禁止)。
 */
import fc from 'fast-check';
import { TEMPLATE_ANGLES } from '../src/vision/template/templates';
import type { GrayFrame } from '../src/vision/types';
import { DIGITS, LETTERS } from '../src/vision/types';

/** 'A'〜'Z' の1文字。 */
export const letterArb = fc.constantFrom(...LETTERS.split(''));

/** '0'〜'9' の1文字。 */
export const digitCharArb = fc.constantFrom(...DIGITS.split(''));

/** '000'〜'999' の3桁数字。 */
export const digitsArb = fc.integer({ min: 0, max: 999 }).map((n) => String(n).padStart(3, '0'));

/** テンプレートバンクがカバーする回転角。 */
export const bankAngleArb = fc.constantFrom(...TEMPLATE_ANGLES);

/** 小さなグレースケールフレーム(4〜32px角、全輝度域)。 */
export const grayFrameArb: fc.Arbitrary<GrayFrame> = fc
  .tuple(fc.integer({ min: 4, max: 32 }), fc.integer({ min: 4, max: 32 }))
  .chain(([width, height]) =>
    fc
      .uint8Array({ minLength: width * height, maxLength: width * height })
      .map((data) => ({ width, height, data: new Uint8Array(data) })),
  );

/** 定数輝度のフレーム(縮退ケース)。 */
export const uniformGrayFrameArb: fc.Arbitrary<GrayFrame> = fc
  .tuple(fc.integer({ min: 4, max: 32 }), fc.integer({ min: 4, max: 32 }), fc.integer({ min: 0, max: 255 }))
  .map(([width, height, v]) => ({ width, height, data: new Uint8Array(width * height).fill(v) }));

/** 小さな二値マスク(0/1)。 */
export const binaryMaskArb = fc
  .tuple(fc.integer({ min: 4, max: 32 }), fc.integer({ min: 4, max: 32 }))
  .chain(([width, height]) =>
    fc
      .array(fc.boolean(), { minLength: width * height, maxLength: width * height })
      .map((bits) => ({ width, height, data: new Uint8Array(bits.map((b) => (b ? 1 : 0))) })),
  );

/** シミュレータ用シード。 */
export const seedArb = fc.integer({ min: 0, max: 2 ** 31 - 1 });

// ---- Unit 2 (app-shell) 用ドメインジェネレータ ----
import type { PairCandidate } from '../src/vision/types';
import type { PairRecord } from '../src/state/record-store';
import type { Settings } from '../src/state/settings-store';

/** 信頼度(0〜1)。 */
export const confidenceArb = fc.double({ min: 0, max: 1, noNaN: true });

/** 有効なペア候補(cardBoxは正の寸法)。 */
export const candidateArb: fc.Arbitrary<PairCandidate> = fc
  .tuple(
    letterArb,
    digitsArb,
    confidenceArb,
    fc.integer({ min: 0, max: 1200 }),
    fc.integer({ min: 0, max: 700 }),
    fc.integer({ min: 1, max: 120 }),
  )
  .map(([letter, digits, confidence, x, y, size]) => ({
    letter,
    digits,
    confidence,
    cardBox: { x, y, w: size, h: size },
  }));

/** 有効な確定記録。idはドメイン規約どおり letter-digits。 */
export const pairRecordArb: fc.Arbitrary<PairRecord> = fc
  .tuple(
    letterArb,
    digitsArb,
    confidenceArb,
    fc.constantFrom('template', 'tesseract') as fc.Arbitrary<PairRecord['engine']>,
    fc.integer({ min: 1600000000000, max: 1900000000000 }),
    fc.integer({ min: 0, max: 10_000_000 }),
    fc.boolean(),
  )
  .map(([letter, digits, confidence, engine, createdAt, dt, corrected]) => ({
    id: `${letter}-${digits}`,
    letter,
    digits,
    confidence,
    engine,
    createdAt,
    updatedAt: createdAt + dt,
    corrected,
  }));

/** キーが一意な記録集合。 */
export const uniqueRecordsArb: fc.Arbitrary<PairRecord[]> = fc
  .uniqueArray(pairRecordArb, { maxLength: 30, selector: (r) => r.id });

/** 有効な設定値。 */
export const settingsArb: fc.Arbitrary<Settings> = fc.record({
  intervalMs: fc.integer({ min: 1000, max: 10000 }),
  confidenceThreshold: fc.double({ min: 0.4, max: 0.9, noNaN: true }),
  engine: fc.constantFrom('template', 'tesseract') as fc.Arbitrary<Settings['engine']>,
  source: fc.constantFrom('camera', 'simulator') as fc.Arbitrary<Settings['source']>,
});
