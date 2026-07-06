/** PBT: SettingsStore — U2-P2(save→loadラウンドトリップ+不正値正規化: PBT-02, BR-U2-8)。 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SettingsStore,
  normalizeSettings,
  type StringStorage,
} from '../src/state/settings-store';
import { settingsArb } from './generators';

/** Nodeテスト用のメモリlocalStorage。 */
function memoryStorage(): StringStorage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
  };
}

describe('U2-P2: Settings ラウンドトリップ', () => {
  it('有効な設定はsave→新インスタンスのloadで完全一致', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const storage = memoryStorage();
        const store1 = new SettingsStore(storage);
        store1.save(s);
        const store2 = new SettingsStore(storage);
        expect(store2.get()).toEqual(store1.get());
        // 有効値は正規化で変化しない(clampは範囲内なら恒等)
        expect(store2.get()).toEqual({ ...s, intervalMs: Math.round(s.intervalMs) });
      }),
    );
  });

  it('どんな生データをloadしても常に有効なSettingsになる(BR-U2-8)', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const s = normalizeSettings(raw);
        expect(s.intervalMs).toBeGreaterThanOrEqual(1000);
        expect(s.intervalMs).toBeLessThanOrEqual(10000);
        expect(s.confidenceThreshold).toBeGreaterThanOrEqual(0.4);
        expect(s.confidenceThreshold).toBeLessThanOrEqual(0.9);
        expect(['template', 'tesseract']).toContain(s.engine);
        expect(['camera', 'simulator']).toContain(s.source);
      }),
    );
  });

  it('不正な項目だけが既定値へ戻る(項目単位の正規化)', () => {
    const s = normalizeSettings({ intervalMs: 5000, confidenceThreshold: 'bad', engine: 'template', source: 'nope' });
    expect(s.intervalMs).toBe(5000);
    expect(s.confidenceThreshold).toBe(DEFAULT_SETTINGS.confidenceThreshold);
    expect(s.engine).toBe('template');
    expect(s.source).toBe(DEFAULT_SETTINGS.source);
  });

  it('壊れたJSONは既定値ロード(例示)', () => {
    const storage = memoryStorage();
    storage.setItem('card-pair-scanner:settings', '{oops');
    const store = new SettingsStore(storage);
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });
});
