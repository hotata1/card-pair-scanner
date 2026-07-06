import type { PairRecord } from '../state/record-store';
import { el } from './dom';

export interface ResultsPanelCallbacks {
  onEdit: (record: PairRecord) => void;
  onDelete: (record: PairRecord) => void;
}

/** ResultsPanel: 記録一覧(辞書順: BR-U2-6)+編集/削除(US-09/10/11)。 */
export class ResultsPanel {
  readonly root: HTMLElement;
  private list: HTMLElement;
  private empty: HTMLElement;

  constructor(private cb: ResultsPanelCallbacks) {
    this.list = el('div', { className: 'pair-list', testId: 'results-panel-pair-list' });
    this.empty = el('div', {
      className: 'empty-state',
      testId: 'results-panel-empty-state',
      text: 'まだ記録がありません。カードにかざして撮影してください。',
    });
    this.root = el('div', { className: 'results-panel' }, this.list, this.empty);
  }

  /** RecordStore.onChange から呼ばれる(recordsは辞書順で渡ってくる)。 */
  render(records: PairRecord[]): void {
    this.empty.style.display = records.length === 0 ? '' : 'none';
    this.list.replaceChildren(
      ...records.map((r) =>
        el(
          'div',
          { className: `pair-row${r.corrected ? ' corrected' : ''}`, attrs: { 'data-pair-id': r.id } },
          el('span', { text: `${r.letter}-${r.digits}` }),
          el('button', {
            className: 'row-btn',
            text: '✎',
            testId: 'pair-row-edit-button',
            attrs: { 'aria-label': `${r.id} を修正` },
            onClick: () => this.cb.onEdit(r),
          }),
          el('button', {
            className: 'row-btn',
            text: '🗑',
            testId: 'pair-row-delete-button',
            attrs: { 'aria-label': `${r.id} を削除` },
            onClick: () => this.cb.onDelete(r),
          }),
        ),
      ),
    );
  }
}
