import type { Settings } from '../state/settings-store';
import { confirmDialog } from './confirm-dialog';
import { el } from './dom';

export interface SettingsPanelCallbacks {
  onChange: (patch: Partial<Settings>) => void;
  onClearAll: () => Promise<void>;
  getRecordCount: () => number;
  /** 設定済み(ログインゲート有効)の場合のみログアウトボタンを表示。 */
  onLogout?: () => void;
}

export interface SettingsPanelOptions {
  /** AWS(Rekognition)エンジンが利用可能(=エンドポイント設定済み)な場合のみ選択肢に出す。 */
  awsAvailable?: boolean;
}

/** SettingsPanel: 設定モーダル(US-04/US-13)+全削除(Q5: A、2段階確認)。 */
export class SettingsPanel {
  private backdrop: HTMLElement | null = null;

  constructor(
    private cb: SettingsPanelCallbacks,
    private version = '',
    private opts: SettingsPanelOptions = {},
  ) {}

  open(settings: Settings): void {
    if (this.backdrop) return;

    const intervalLabel = el('span', { className: 'value-label', text: `${settings.intervalMs / 1000}秒` });
    const interval = el('input', {
      testId: 'settings-interval-slider',
      attrs: { type: 'range', min: '1000', max: '10000', step: '500', value: String(settings.intervalMs) },
    });
    interval.addEventListener('input', () => {
      intervalLabel.textContent = `${Number(interval.value) / 1000}秒`;
      this.cb.onChange({ intervalMs: Number(interval.value) });
    });

    const thLabel = el('span', { className: 'value-label', text: settings.confidenceThreshold.toFixed(2) });
    const threshold = el('input', {
      testId: 'settings-threshold-slider',
      attrs: { type: 'range', min: '0.4', max: '0.9', step: '0.01', value: String(settings.confidenceThreshold) },
    });
    threshold.addEventListener('input', () => {
      thLabel.textContent = Number(threshold.value).toFixed(2);
      this.cb.onChange({ confidenceThreshold: Number(threshold.value) });
    });

    const engine = el('select', { testId: 'settings-engine-select' });
    engine.append(new Option('テンプレート照合(推奨)', 'template'), new Option('Tesseract OCR(比較用)', 'tesseract'));
    if (this.opts.awsAvailable) engine.append(new Option('AWS(Rekognition)', 'aws'));
    engine.value = settings.engine;
    engine.addEventListener('change', () => this.cb.onChange({ engine: engine.value as Settings['engine'] }));

    const source = el('select', { testId: 'settings-source-select' });
    source.append(new Option('カメラ', 'camera'), new Option('シミュレータ(動作確認用)', 'simulator'));
    source.value = settings.source;
    source.addEventListener('change', () => this.cb.onChange({ source: source.value as Settings['source'] }));

    const clearBtn = el('button', {
      className: 'danger',
      text: '全記録を削除…',
      testId: 'settings-clear-all-button',
      onClick: () => void this.clearAllFlow(),
    });

    const logoutBtn = this.cb.onLogout
      ? el('button', { text: 'ログアウト', testId: 'settings-logout-button', onClick: () => this.cb.onLogout!() })
      : null;

    this.backdrop = el(
      'div',
      { className: 'modal-backdrop' },
      el(
        'div',
        { className: 'modal' },
        el('h2', { text: this.version ? `設定 (v${this.version})` : '設定', testId: 'settings-title' }),
        el('div', { className: 'row' }, el('label', { text: '自動撮影の間隔' }), interval, intervalLabel),
        el('div', { className: 'row' }, el('label', { text: '読み取りの厳しさ(信頼度閾値)' }), threshold, thLabel),
        el('div', { className: 'row' }, el('label', { text: '認識エンジン' }), engine),
        el('div', { className: 'row' }, el('label', { text: '映像ソース' }), source),
        el('div', { className: 'divider' }),
        clearBtn,
        el(
          'div',
          { className: 'actions' },
          ...(logoutBtn ? [logoutBtn] : []),
          el('button', { className: 'primary', text: '閉じる', testId: 'settings-close-button', onClick: () => this.close() }),
        ),
      ),
    );
    this.backdrop.addEventListener('click', (ev) => {
      if (ev.target === this.backdrop) this.close();
    });
    document.body.append(this.backdrop);
  }

  close(): void {
    this.backdrop?.remove();
    this.backdrop = null;
  }

  /** 全削除の2段階確認(BR-U2-4)。 */
  private async clearAllFlow(): Promise<void> {
    const count = this.cb.getRecordCount();
    if (count === 0) return;
    const first = await confirmDialog('全記録の削除', `記録済みの ${count}件 をすべて削除しますか?`, '次へ');
    if (!first) return;
    const second = await confirmDialog('最終確認', 'この操作は元に戻せません。本当に削除しますか?', '削除する');
    if (!second) return;
    await this.cb.onClearAll();
    this.close();
  }
}
