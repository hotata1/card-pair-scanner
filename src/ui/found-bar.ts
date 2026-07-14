import { el } from './dom';

/** FoundBar: 検索で見つかった番号を画面下部に控えめに一覧表示する。 */
export class FoundBar {
  readonly root: HTMLElement;

  constructor() {
    this.root = el('div', { className: 'found-bar', testId: 'found-bar' });
  }

  clear(): void {
    this.root.replaceChildren();
  }

  add(letter: string, digits: string): void {
    const row = el(
      'span',
      { className: 'found-chip', testId: `found-chip-${digits}` },
      `${letter}-${digits}`,
      el('button', {
        className: 'row-btn',
        text: '×',
        testId: `found-chip-remove-${digits}`,
        onClick: () => row.remove(),
      }),
    );
    this.root.prepend(row);
  }
}
