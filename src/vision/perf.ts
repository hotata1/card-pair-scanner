/**
 * PerfMeter(LC-2): パイプライン各段の所要時間を計測する軽量スパン計測。
 * Worker化判断(NFR設計P-1)の根拠データを提供する。開発時のみ有効化。
 */
export class PerfMeter {
  private spans = new Map<string, { total: number; count: number; last: number }>();
  enabled = false;

  measure<T>(name: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const result = fn();
    this.record(name, performance.now() - t0);
    return result;
  }

  async measureAsync<T>(name: string, fn: () => Promise<T>): Promise<T> {
    if (!this.enabled) return fn();
    const t0 = performance.now();
    const result = await fn();
    this.record(name, performance.now() - t0);
    return result;
  }

  record(name: string, ms: number): void {
    const s = this.spans.get(name) ?? { total: 0, count: 0, last: 0 };
    s.total += ms;
    s.count++;
    s.last = ms;
    this.spans.set(name, s);
  }

  summary(): Record<string, { avgMs: number; lastMs: number; count: number }> {
    const out: Record<string, { avgMs: number; lastMs: number; count: number }> = {};
    for (const [k, v] of this.spans) {
      out[k] = { avgMs: v.total / v.count, lastMs: v.last, count: v.count };
    }
    return out;
  }

  reset(): void {
    this.spans.clear();
  }
}
