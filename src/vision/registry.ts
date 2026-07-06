import type { EngineKind, Recognizer } from './types';

export interface EngineSelection {
  recognizer: Recognizer;
  /** フォールバックが起きた場合、その理由(UI通知用: Unit 2)。 */
  fallbackReason?: string;
}

/**
 * EngineRegistry(LC-4): エンジンの生成・初期化・フォールバックを一元管理。
 * フォールバックは tesseract→template の1方向のみ(NFR設計R-1)。
 */
export class EngineRegistry {
  private engines = new Map<EngineKind, Recognizer>();

  register(engine: Recognizer): void {
    this.engines.set(engine.kind, engine);
  }

  /** 指定エンジンを初期化して返す。失敗時はtemplateへフォールバック。 */
  async select(kind: EngineKind): Promise<EngineSelection> {
    const engine = this.engines.get(kind);
    if (!engine) throw new Error(`EngineRegistry: unknown engine '${kind}'`);
    try {
      await engine.init();
      return { recognizer: engine };
    } catch (err) {
      if (kind === 'template') throw err; // templateの失敗は致命的(R-1)
      const fallback = this.engines.get('template');
      if (!fallback) throw err;
      await fallback.init();
      return {
        recognizer: fallback,
        fallbackReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  disposeAll(): void {
    for (const e of this.engines.values()) e.dispose();
    this.engines.clear();
  }
}
