import { el } from './dom';

/** LoginGate: 未認証時はアプリの入口そのものを堰き止める全画面UI。 */
export function renderLoginGate(root: HTMLElement, onLogin: () => void): void {
  root.replaceChildren(
    el(
      'div',
      { className: 'login-gate' },
      el('h1', { text: 'card-pair-scanner' }),
      el('p', { text: 'このアプリを使うにはログインが必要です。' }),
      el('button', {
        className: 'primary',
        text: 'ログイン',
        testId: 'login-gate-button',
        onClick: onLogin,
      }),
    ),
  );
}
