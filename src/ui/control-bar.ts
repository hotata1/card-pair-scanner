import { el } from './dom';

export interface ControlBarCallbacks {
  onAutoToggle: () => void;
  onShutter: () => void;
  onSettings: () => void;
}

/** ControlBar: 自動撮影トグル+手動シャッター+設定(US-04/US-05)。 */
export class ControlBar {
  readonly root: HTMLElement;
  private autoBtn: HTMLButtonElement;
  private shutterBtn: HTMLButtonElement;

  constructor(cb: ControlBarCallbacks) {
    this.autoBtn = el('button', {
      className: 'primary',
      text: '自動撮影を開始',
      testId: 'control-bar-auto-toggle-button',
      onClick: cb.onAutoToggle,
    });
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
    this.root = el('div', { className: 'control-bar' }, this.autoBtn, shutter, settings);
  }

  setAutoRunning(running: boolean): void {
    this.autoBtn.textContent = running ? '自動撮影を停止' : '自動撮影を開始';
    this.autoBtn.classList.toggle('danger', running);
    this.autoBtn.classList.toggle('primary', !running);
  }

  /** 連写中の進捗表示(例: "3/8")。null で📷に戻す。 */
  setShutterProgress(text: string | null): void {
    this.shutterBtn.textContent = text ?? '📷';
    this.shutterBtn.disabled = text !== null;
  }

  /** 番号検索中は自動撮影/連写と状態が競合するため操作を止める。 */
  setSearchLock(locked: boolean): void {
    this.autoBtn.disabled = locked;
    this.shutterBtn.disabled = locked;
  }
}
