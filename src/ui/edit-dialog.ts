import type { PairRecord } from '../state/record-store';
import { isValidDigits, isValidLetter } from '../vision/types';
import { el } from './dom';

export interface EditResult {
  letter: string;
  digits: string;
}

/**
 * EditDialog: ペアの手動修正(US-10)。
 * 入力検証(A〜Z1文字 / 3桁数字)を満たすまで保存不可。
 * onSave が 'conflict' を返したらダイアログを閉じず衝突を通知する(BR-U2-3)。
 */
export function editDialog(
  record: PairRecord,
  onSave: (r: EditResult) => Promise<'ok' | 'conflict' | 'not-found' | 'invalid'>,
): Promise<void> {
  return new Promise((resolve) => {
    const letterInput = el('input', {
      testId: 'edit-dialog-letter-input',
      attrs: { type: 'text', maxlength: '1', autocapitalize: 'characters', value: record.letter },
    });
    const digitsInput = el('input', {
      testId: 'edit-dialog-digits-input',
      attrs: { type: 'text', maxlength: '3', inputmode: 'numeric', pattern: '[0-9]*', value: record.digits },
    });
    const conflict = el('div', { className: 'conflict-notice', testId: 'edit-dialog-conflict-notice' });
    const saveBtn = el('button', { className: 'primary', text: '保存', testId: 'edit-dialog-save-button' });

    const current = (): EditResult => ({
      letter: letterInput.value.toUpperCase().trim(),
      digits: digitsInput.value.trim(),
    });
    const validate = (): void => {
      const v = current();
      saveBtn.disabled = !(isValidLetter(v.letter) && isValidDigits(v.digits));
      conflict.textContent = '';
    };
    letterInput.addEventListener('input', validate);
    digitsInput.addEventListener('input', validate);

    const close = (): void => {
      backdrop.remove();
      resolve();
    };
    saveBtn.addEventListener('click', () => {
      void (async () => {
        const v = current();
        const result = await onSave(v);
        if (result === 'ok') {
          close();
        } else if (result === 'conflict') {
          conflict.textContent = `${v.letter}-${v.digits} は既に記録されています`;
        } else {
          conflict.textContent = '保存できませんでした';
        }
      })();
    });

    const backdrop = el(
      'div',
      { className: 'modal-backdrop' },
      el(
        'div',
        { className: 'modal' },
        el('h2', { text: `${record.id} を修正` }),
        el('div', { className: 'row' }, el('label', { text: '文字 (A〜Z)' }), letterInput),
        el('div', { className: 'row' }, el('label', { text: '数字 (3桁)' }), digitsInput),
        conflict,
        el(
          'div',
          { className: 'actions' },
          el('button', { text: 'キャンセル', testId: 'edit-dialog-cancel-button', onClick: close }),
          saveBtn,
        ),
      ),
    );
    validate();
    document.body.append(backdrop);
    letterInput.focus();
  });
}
