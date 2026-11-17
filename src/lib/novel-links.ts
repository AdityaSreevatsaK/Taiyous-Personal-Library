import type { MouseEvent } from 'react';

/** Intercept only an ordinary same-tab click for internal navigation.
 * Preserve middle-click, Ctrl/Cmd-click, Shift-click, copy-link, native context
 * menus, and browser history; never open an extra tab programmatically.
 */
export function openInternalLinkInCurrentTab(
  event: MouseEvent<HTMLAnchorElement>, open: () => void,
): void {
  if (event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open();
}

/** Kept as an alias for existing book and reader links. */
export { openInternalLinkInCurrentTab as openNovelInCurrentTab };
