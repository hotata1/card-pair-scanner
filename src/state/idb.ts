/**
 * IndexedDB 薄ラッパ(Promise化)。letter-locator state/idb.ts を参考に単純化。
 * 利用不可環境(プライベートモード等)では open が reject し、
 * RecordStore がメモリのみモードへ移行する(BR-U2-5)。
 */
export interface KVStore {
  getAll<T>(): Promise<T[]>;
  put<T>(value: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

export const DB_NAME = 'card-pair-scanner';
export const PAIR_STORE = 'pairs';

export function openPairStore(dbName = DB_NAME, storeName = PAIR_STORE): Promise<KVStore> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(storeName)) {
        db.createObjectStore(storeName, { keyPath: 'id' });
      }
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
    req.onsuccess = () => {
      const db = req.result;
      const tx = (mode: IDBTransactionMode) => db.transaction(storeName, mode).objectStore(storeName);
      const wrap = <T>(r: IDBRequest<T>): Promise<T> =>
        new Promise((res, rej) => {
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error ?? new Error('IndexedDB request failed'));
        });
      resolve({
        getAll: <T>() => wrap(tx('readonly').getAll() as IDBRequest<T[]>),
        put: <T>(value: T) => wrap(tx('readwrite').put(value)).then(() => undefined),
        delete: (key: string) => wrap(tx('readwrite').delete(key)).then(() => undefined),
        clear: () => wrap(tx('readwrite').clear()).then(() => undefined),
      });
    };
  });
}
