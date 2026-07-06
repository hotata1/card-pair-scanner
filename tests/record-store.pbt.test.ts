/** PBT: RecordStore — U2-P1(ラウンドトリップ)/ U2-P3(一意性)/ U2-P4(冪等)/ U2-P5(ソート)/ U2-P6(衝突)。 */
import 'fake-indexeddb/auto';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { openPairStore } from '../src/state/idb';
import { RecordStore, pairId } from '../src/state/record-store';
import { candidateArb, digitsArb, letterArb } from './generators';

let dbSeq = 0;
/** テストごとに独立したDBを使う(fake-indexeddbはプロセス内共有のため)。 */
const freshOpen = () => {
  const name = `test-db-${++dbSeq}-${Date.now()}`;
  return () => openPairStore(name);
};

describe('U2-P1: PairRecord 保存→読込ラウンドトリップ(PBT-02)', () => {
  it('addした全レコードが、別インスタンスのinitで完全復元される', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(candidateArb, { maxLength: 20 }), async (candidates) => {
        const open = freshOpen();
        const store1 = new RecordStore();
        await store1.init(open);
        for (const c of candidates) store1.add(c, 'template');
        // 永続化の完了を待つ(putは非同期発行のためマイクロタスクを流す)
        await new Promise((r) => setTimeout(r, 0));

        const store2 = new RecordStore();
        await store2.init(open);
        expect(store2.getAll()).toEqual(store1.getAll());
      }),
      { numRuns: 30 },
    );
  });
});

describe('U2-P3/P4: 一意性と冪等(PBT-03)', () => {
  it('レコード数 = ユニークキー数、同じ列を2回addしても不変', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(candidateArb, { maxLength: 30 }), async (candidates) => {
        const store = new RecordStore();
        await store.init(() => Promise.reject(new Error('memory-only'))); // メモリのみで十分
        for (const c of candidates) store.add(c, 'template');
        const uniqueKeys = new Set(candidates.map((c) => pairId(c.letter, c.digits)));
        expect(store.size).toBe(uniqueKeys.size);

        const snapshot = store.getAll();
        for (const c of candidates) store.add(c, 'template'); // 2回目(冪等: BR-U2-2)
        expect(store.getAll()).toEqual(snapshot);
      }),
    );
  });
});

describe('U2-P5: 一覧は辞書順・要素保存(PBT-03)', () => {
  it('getAllはid昇順で、レコードを失わない', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(candidateArb, { maxLength: 30 }), async (candidates) => {
        const store = new RecordStore();
        await store.init(() => Promise.reject(new Error('memory-only')));
        for (const c of candidates) store.add(c, 'template');
        const all = store.getAll();
        expect(all.length).toBe(store.size);
        for (let i = 1; i < all.length; i++) {
          expect(all[i - 1].id < all[i].id).toBe(true);
        }
      }),
    );
  });
});

describe('U2-P6: 修正の衝突検知(PBT-03 / BR-U2-3)', () => {
  it('衝突しない修正は成功、衝突する修正はストアを変えない', async () => {
    await fc.assert(
      fc.asyncProperty(candidateArb, candidateArb, letterArb, digitsArb, async (a, b, newLetter, newDigits) => {
        const idA = pairId(a.letter, a.digits);
        const idB = pairId(b.letter, b.digits);
        fc.pre(idA !== idB); // 2つの異なるレコードから開始
        const store = new RecordStore();
        await store.init(() => Promise.reject(new Error('memory-only')));
        store.add(a, 'template');
        store.add(b, 'template');

        const newId = pairId(newLetter, newDigits);
        const before = store.getAll();
        const result = await store.update(idA, newLetter, newDigits);
        if (newId !== idA && newId === idB) {
          expect(result).toBe('conflict');
          expect(store.getAll()).toEqual(before); // 変化なし
        } else {
          expect(result).toBe('ok');
          expect(store.has(newId)).toBe(true);
          const rec = store.getAll().find((r) => r.id === newId)!;
          expect(rec.corrected).toBe(true);
          expect(store.size).toBe(2);
        }
      }),
    );
  });

  it('存在しないidの修正は not-found', async () => {
    const store = new RecordStore();
    await store.init(() => Promise.reject(new Error('memory-only')));
    expect(await store.update('A-000', 'B', '111')).toBe('not-found');
  });
});

describe('例示: IndexedDB不可でもメモリで動作継続(BR-U2-5)', () => {
  it('storageAvailable=false でも add/getAll/remove が機能する', async () => {
    const store = new RecordStore();
    await store.init(() => Promise.reject(new Error('private mode')));
    expect(store.storageAvailable).toBe(false);
    expect(store.add({ letter: 'A', digits: '123', confidence: 0.9, cardBox: { x: 0, y: 0, w: 1, h: 1 } }, 'template')).toBe(true);
    expect(store.size).toBe(1);
    await store.remove('A-123');
    expect(store.size).toBe(0);
  });
});
