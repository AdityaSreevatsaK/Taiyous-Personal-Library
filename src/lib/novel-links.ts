import type { MouseEvent } from 'react';

/** Intercept only an ordinary same-tab click. Let the browser own new tabs,
 * middle-click, modifier-click, copy-link and the native context menu.
 */
export function openNovelInCurrentTab(
  event: MouseEvent<HTMLAnchorElement>, open: () => void,
): void {
  if (event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open();
}
