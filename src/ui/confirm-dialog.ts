import { el } from './dom';

/** 汎用確認ダイアログ(削除・全削除の確認: Q3A/Q5A)。 */
export function confirmDialog(title: string, message: string, okLabel = 'OK', danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    const close = (result: boolean): void => {
      backdrop.remove();
      resolve(result);
    };
    const backdrop = el(
      'div',
      { className: 'modal-backdrop' },
      el(
        'div',
        { className: 'modal' },
        el('h2', { text: title }),
        el('div', { text: message }),
        el(
          'div',
          { className: 'actions' },
          el('button', { text: 'キャンセル', testId: 'confirm-dialog-cancel-button', onClick: () => close(false) }),
          el('button', {
            className: danger ? 'danger' : 'primary',
            text: okLabel,
            testId: 'confirm-dialog-ok-button',
            onClick: () => close(true),
          }),
        ),
      ),
    );
    document.body.append(backdrop);
  });
}
