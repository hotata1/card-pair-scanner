import { el } from './dom';

/** StatusBar: 常設インジケータ(Q1: B)+エンジン通知+記録件数バッジ。 */
export class StatusBar {
  readonly root: HTMLElement;
  private retry: HTMLElement;
  private notice: HTMLElement;
  private badge: HTMLElement;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.retry = el('span', { className: 'retry-indicator', testId: 'status-bar-retry-indicator' });
    this.notice = el('span', { className: 'engine-notice', testId: 'status-bar-engine-notice' });
    this.badge = el('span', { className: 'count-badge', testId: 'status-bar-count-badge' });
    this.root = el('div', { className: 'status-bar' }, this.retry, this.notice, this.badge);
    this.setLowConfidenceCount(0);
    this.setRecordCount(0);
  }

  /** 直近フレームの「読めていないカード」数(BR-U2-7: 0で自動消灯)。 */
  setLowConfidenceCount(count: number): void {
    this.retry.textContent =
      count > 0 ? `読めていないカードが${count}枚あります — 近づく・明るくすると読み取りやすくなります` : '';
  }

  /** フォールバック等の一時通知(数秒で消える)。 */
  showNotice(message: string, ms = 8000): void {
    this.notice.textContent = message;
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      this.notice.textContent = '';
    }, ms);
  }

  setRecordCount(count: number): void {
    this.badge.textContent = `記録済み ${count}件`;
  }
}
