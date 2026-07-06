import type { EngineKind } from '../vision/types';

/** アプリ設定(domain-entities.md準拠、既定値はQ4で承認済み)。 */
export interface Settings {
  intervalMs: number; // 1000〜10000
  confidenceThreshold: number; // 0.4〜0.9
  engine: EngineKind;
  source: 'camera' | 'simulator';
}

export const DEFAULT_SETTINGS: Settings = {
  intervalMs: 3000,
  confidenceThreshold: 0.65,
  engine: 'template',
  source: 'camera',
};

const KEY = 'card-pair-scanner:settings';

/** localStorage互換の注入ポイント(Nodeテスト用)。 */
export interface StringStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 項目単位の正規化(BR-U2-8): 不正な項目だけを既定値に戻す。 */
export function normalizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    intervalMs:
      typeof o.intervalMs === 'number' && Number.isFinite(o.intervalMs)
        ? clamp(Math.round(o.intervalMs), 1000, 10000)
        : d.intervalMs,
    confidenceThreshold:
      typeof o.confidenceThreshold === 'number' && Number.isFinite(o.confidenceThreshold)
        ? clamp(o.confidenceThreshold, 0.4, 0.9)
        : d.confidenceThreshold,
    engine: o.engine === 'template' || o.engine === 'tesseract' ? o.engine : d.engine,
    source: o.source === 'camera' || o.source === 'simulator' ? o.source : d.source,
  };
}

/** SettingsStore: save→loadラウンドトリップ不変(U2-P2)、即時反映+購読。 */
export class SettingsStore {
  private current: Settings;
  private listeners = new Set<(s: Settings) => void>();

  constructor(private storage: StringStorage = window.localStorage) {
    this.current = this.loadRaw();
  }

  private loadRaw(): Settings {
    try {
      const raw = this.storage.getItem(KEY);
      if (raw === null) return { ...DEFAULT_SETTINGS };
      return normalizeSettings(JSON.parse(raw));
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  get(): Settings {
    return { ...this.current };
  }

  save(patch: Partial<Settings>): Settings {
    this.current = normalizeSettings({ ...this.current, ...patch });
    try {
      this.storage.setItem(KEY, JSON.stringify(this.current));
    } catch (err) {
      console.warn('SettingsStore: save failed (continuing in-memory)', err);
    }
    const snapshot = this.get();
    for (const l of this.listeners) l(snapshot);
    return snapshot;
  }

  onChange(listener: (s: Settings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
