import { el } from './dom';

export interface ControlBarCallbacks {
  onShutter: () => void;
  onReset: () => void;
  onSettings: () => void;
}

/** ControlBar: 手動シャッター(連写)+記録リセット+設定。 */
export class ControlBar {
  readonly root: HTMLElement;
  private shutterBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;

  constructor(cb: ControlBarCallbacks) {
    const reset = el('button', {
      text: 'リセット',
      testId: 'control-bar-reset-button',
      onClick: cb.onReset,
    });
    this.resetBtn = reset;
    const shutter = el('button', {
      className: 'shutter',
      text: '📷',
      testId: 'control-bar-shutter-button',
      attrs: { 'aria-label': '連写撮影' },
      onClick: cb.onShutter,
    });
    this.shutterBtn = shutter;
    const settings = el('button', {
      text: '⚙ 設定',
      testId: 'control-bar-settings-button',
      onClick: cb.onSettings,
    });
    this.root = el('div', { className: 'control-bar' }, reset, shutter, settings);
  }

  /** 連写中の進捗表示(例: "3/8")。null で📷に戻す。 */
  setShutterProgress(text: string | null): void {
    this.shutterBtn.textContent = text ?? '📷';
    this.shutterBtn.disabled = text !== null;
  }

  /** 番号検索中は連写/リセットと状態が競合するため操作を止める。 */
  setSearchLock(locked: boolean): void {
    this.shutterBtn.disabled = locked;
    this.resetBtn.disabled = locked;
  }
}
