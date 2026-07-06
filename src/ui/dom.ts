/** 最小限のDOM生成ヘルパー(vanilla構成: 設計Q2)。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: {
    className?: string;
    text?: string;
    testId?: string;
    attrs?: Record<string, string>;
    onClick?: (ev: MouseEvent) => void;
  } = {},
  ...children: (HTMLElement | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.testId) node.setAttribute('data-testid', props.testId);
  if (props.attrs) {
    for (const [k, v] of Object.entries(props.attrs)) node.setAttribute(k, v);
  }
  if (props.onClick) node.addEventListener('click', props.onClick as EventListener);
  for (const c of children) {
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}
