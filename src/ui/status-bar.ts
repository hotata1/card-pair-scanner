import { el } from './dom';

/** StatusBar: 常設インジケータ(Q1: B)+エンジン通知+記録件数バッジ。 */
export class StatusBar {
  readonly root: HTMLElement;
  private retry: HTMLElement;
  private notice: HTMLElement;
  private info: HTMLElement;
  private badge: HTMLElement;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.retry = el('span', { className: 'retry-indicator', testId: 'status-bar-retry-indicator' });
    this.notice = el('span', { className: 'engine-notice', testId: 'status-bar-engine-notice' });
    this.info = el('span', { className: 'capture-info', testId: 'status-bar-capture-info' });
    this.badge = el('span', { className: 'count-badge', testId: 'status-bar-count-badge' });
    this.root = el('div', { className: 'status-bar' }, this.retry, this.notice, this.info, this.badge);
    this.setRecordCount(0);
  }

  /** エラーを目立つ位置(オレンジのインジケータ枠)に表示。次の撮影フィードバックで上書きされる。 */
  showError(message: string): void {
    this.retry.textContent = `⚠ ${message}`;
  }

  /**
   * 撮影ごとのフィードバック(BR-U2-7拡張)。
   * 「撮ったのに何も起きない」を防ぐため、検出0枚も含めて毎回必ず何かを表示する。
   */
  setFrameFeedback(cardCount: number, lowCount: number, addedCount: number): void {
    this.info.textContent = `検出${cardCount} 新規+${addedCount}`;
    if (cardCount === 0) {
      this.retry.textContent = 'カードが見つかりません — カード画面だけが大きく映るように近づいてください';
    } else if (lowCount > 0) {
      this.retry.textContent = `読めていないカードが${lowCount}枚あります — 近づく・明るくすると読み取りやすくなります`;
    } else {
      this.retry.textContent = '';
    }
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
