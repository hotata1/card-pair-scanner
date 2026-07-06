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
      attrs: { 'aria-label': '撮影' },
      onClick: cb.onShutter,
    });
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
}
