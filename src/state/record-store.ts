import type { EngineKind, PairCandidate } from '../vision/types';
import { isValidDigits, isValidLetter } from '../vision/types';
import { openPairStore, type KVStore } from './idb';

/** 確定記録(domain-entities.md準拠。保存⇔読込ラウンドトリップ不変: U2-P1)。 */
export interface PairRecord {
  id: string; // `${letter}-${digits}`
  letter: string;
  digits: string;
  confidence: number;
  engine: EngineKind;
  createdAt: number;
  updatedAt: number;
  corrected: boolean;
}

export type UpdateResult = 'ok' | 'conflict' | 'not-found' | 'invalid';

export function pairId(letter: string, digits: string): string {
  return `${letter}-${digits}`;
}

/**
 * RecordStore: ペア記録の管理と永続化。
 * - 先勝ち重複排除(BR-U2-2)
 * - 修正の衝突検知(BR-U2-3)
 * - メモリ同期 + IndexedDB非同期書き込み(BR-U2-5)
 * - IndexedDB不可時はメモリのみで動作継続
 */
export class RecordStore {
  private records = new Map<string, PairRecord>();
  private listeners = new Set<(records: PairRecord[]) => void>();
  private store?: KVStore;
  storageAvailable = false;

  /** openStore はテスト用に注入可能(fake-indexeddb / 失敗スタブ)。 */
  async init(openStore: () => Promise<KVStore> = () => openPairStore()): Promise<void> {
    try {
      this.store = await openStore();
      const all = await this.store.getAll<PairRecord>();
      this.records.clear();
      for (const r of all) this.records.set(r.id, r);
      this.storageAvailable = true;
    } catch (err) {
      console.warn('RecordStore: IndexedDB unavailable, running in-memory only', err);
      this.store = undefined;
      this.storageAvailable = false;
    }
    this.emit();
  }

  /** 追加。重複(同一キー)なら false(BR-U2-2)。無効な候補も false。 */
  add(candidate: PairCandidate, engine: EngineKind): boolean {
    if (!isValidLetter(candidate.letter) || !isValidDigits(candidate.digits)) return false;
    const id = pairId(candidate.letter, candidate.digits);
    if (this.records.has(id)) return false;
    const now = Date.now();
    const record: PairRecord = {
      id,
      letter: candidate.letter,
      digits: candidate.digits,
      confidence: candidate.confidence,
      engine,
      createdAt: now,
      updatedAt: now,
      corrected: false,
    };
    this.records.set(id, record);
    this.persist(record);
    this.emit();
    return true;
  }

  /** 文字→数字の辞書順(BR-U2-6)。idの昇順と等価。 */
  getAll(): PairRecord[] {
    return [...this.records.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  get size(): number {
    return this.records.size;
  }

  has(id: string): boolean {
    return this.records.has(id);
  }

  /** 手動修正(US-10)。キー衝突時は 'conflict' を返しストアは変化しない(BR-U2-3)。 */
  async update(id: string, letter: string, digits: string): Promise<UpdateResult> {
    const existing = this.records.get(id);
    if (!existing) return 'not-found';
    if (!isValidLetter(letter) || !isValidDigits(digits)) return 'invalid';
    const newId = pairId(letter, digits);
    if (newId !== id && this.records.has(newId)) return 'conflict';
    const updated: PairRecord = {
      ...existing,
      id: newId,
      letter,
      digits,
      corrected: true,
      updatedAt: Date.now(),
    };
    this.records.delete(id);
    this.records.set(newId, updated);
    if (newId !== id) this.unpersist(id);
    this.persist(updated);
    this.emit();
    return 'ok';
  }

  async remove(id: string): Promise<void> {
    if (!this.records.delete(id)) return;
    this.unpersist(id);
    this.emit();
  }

  /** 全削除(設計Q5: A。UI側で2段階確認を行う)。 */
  async clear(): Promise<void> {
    this.records.clear();
    if (this.store) {
      this.store.clear().catch((err) => console.error('RecordStore: clear failed', err));
    }
    this.emit();
  }

  onChange(listener: (records: PairRecord[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private persist(record: PairRecord): void {
    if (!this.store) return;
    this.store.put(record).catch((err) => console.error('RecordStore: persist failed', err));
  }

  private unpersist(id: string): void {
    if (!this.store) return;
    this.store.delete(id).catch((err) => console.error('RecordStore: delete failed', err));
  }

  private emit(): void {
    const snapshot = this.getAll();
    for (const l of this.listeners) l(snapshot);
  }
}
