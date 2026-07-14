import { isValidDigits } from '../vision/types';
import { el } from './dom';

const MAX_TARGETS = 5;

export interface SearchBarCallbacks {
  onStart: (targets: string[]) => void;
  onStop: () => void;
}

/**
 * SearchBar: 同時に最大5件までの番号を入力し、見つかるまでカメラで探し続ける機能の入口。
 * (点滅する数字は1枚のフレームでは捉えきれないため、見つかるまで継続スキャンする設計)
 */
export class SearchBar {
  readonly root: HTMLElement;
  private input: HTMLInputElement;
  private addBtn: HTMLButtonElement;
  private toggleBtn: HTMLButtonElement;
  private chipList: HTMLElement;
  private targets: string[] = [];
  private searching = false;

  constructor(private cb: SearchBarCallbacks) {
    this.input = el('input', {
      testId: 'search-bar-input',
      attrs: { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '3', placeholder: '番号(例: 047)' },
    }) as HTMLInputElement;
    this.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') this.addTarget();
    });
    this.addBtn = el('button', { text: '追加', testId: 'search-bar-add-button', onClick: () => this.addTarget() });
    this.toggleBtn = el('button', {
      className: 'primary',
      text: '検索を開始',
      testId: 'search-bar-toggle-button',
      onClick: () => this.toggleSearch(),
    });
    this.chipList = el('div', { className: 'search-chips', testId: 'search-bar-chips' });
    this.root = el(
      'div',
      { className: 'search-bar' },
      el('div', { className: 'search-bar-row' }, this.input, this.addBtn, this.toggleBtn),
      this.chipList,
    );
    this.renderChips();
  }

  /** 認識側で対象の番号が見つかった時に呼ぶ。全件見つかれば自動で検索を終了する。 */
  markFound(digits: string): void {
    this.removeInternal(digits);
    if (this.searching && this.targets.length === 0) this.stopSearching();
  }

  private addTarget(): void {
    const digits = this.input.value.trim();
    this.input.value = '';
    if (!isValidDigits(digits) || this.targets.includes(digits) || this.targets.length >= MAX_TARGETS) return;
    this.targets.push(digits);
    this.renderChips();
  }

  private removeTarget(digits: string): void {
    this.removeInternal(digits);
    if (this.searching && this.targets.length === 0) this.stopSearching();
  }

  private removeInternal(digits: string): void {
    this.targets = this.targets.filter((d) => d !== digits);
    this.renderChips();
  }

  private toggleSearch(): void {
    if (this.searching) {
      this.stopSearching();
      return;
    }
    if (this.targets.length === 0) {
      this.input.focus();
      return;
    }
    this.cb.onStart([...this.targets]);
    this.setSearching(true);
  }

  private stopSearching(): void {
    this.cb.onStop();
    this.setSearching(false);
  }

  setSearching(active: boolean): void {
    this.searching = active;
    this.toggleBtn.textContent = active ? '検索を停止' : '検索を開始';
    this.toggleBtn.classList.toggle('danger', active);
    this.toggleBtn.classList.toggle('primary', !active);
    this.input.disabled = active;
    this.addBtn.disabled = active;
    this.renderChips();
  }

  private renderChips(): void {
    this.chipList.replaceChildren(
      ...this.targets.map((digits) =>
        el(
          'span',
          { className: 'search-chip', testId: `search-chip-${digits}` },
          digits,
          el('button', {
            className: 'row-btn',
            text: '×',
            testId: `search-chip-remove-${digits}`,
            onClick: () => this.removeTarget(digits),
          }),
        ),
      ),
    );
  }
}
