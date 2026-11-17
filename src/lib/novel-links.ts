import type { FocusEvent, MouseEvent } from 'react';

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

/** Browser-native tooltip only if a visual title was actually ellipsised or
 * line-clamped. Full titles remain visible to assistive technology as content.
 */
export function revealClippedLinkTitle(
  event: MouseEvent<HTMLAnchorElement> | FocusEvent<HTMLAnchorElement>,
  title: string,
): void {
  const el = event.currentTarget;
  const isClipped = el.scrollWidth > el.clientWidth + 1 ||
    el.scrollHeight > el.clientHeight + 1;
  if (isClipped) el.setAttribute('title', title);
  else el.removeAttribute('title');
}
