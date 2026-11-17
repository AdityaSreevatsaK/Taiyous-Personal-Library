import { describe, expect, it, vi } from 'vitest';
import { openInternalLinkInCurrentTab, openNovelInCurrentTab, revealClippedLinkTitle } from './novel-links';
import type { MouseEvent } from 'react';

function click(options: Partial<MouseEvent<HTMLAnchorElement>> = {}) {
  const preventDefault = vi.fn();
  const callback = vi.fn();
  openNovelInCurrentTab({
    button: 0, defaultPrevented: false, ctrlKey: false,
    metaKey: false, shiftKey: false, altKey: false,
    preventDefault, ...options,
  } as unknown as MouseEvent<HTMLAnchorElement>, callback);
  return { preventDefault, callback };
}
describe('native novel links', () => {
  it('handles ordinary same-tab and keyboard activation through the SPA', () => {
    const {preventDefault, callback} = click();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(callback).toHaveBeenCalledOnce();
  });
  it.each([{ctrlKey: true}, {metaKey: true}, {shiftKey: true}, {altKey: true},
    {button: 1}, {button: 2}, {defaultPrevented: true}])(
    'keeps browser-native link handling for %j', (options) => {
      const {preventDefault, callback} = click(options);
      expect(preventDefault).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    },
  );
});

describe('all internal navigation links', () => {
  it('uses the same native-click semantics for header and novel links', () => {
    const preventDefault = vi.fn();
    const navigate = vi.fn();
    openInternalLinkInCurrentTab({
      button: 0, defaultPrevented: false, ctrlKey: false, metaKey: false,
      shiftKey: false, altKey: false, preventDefault,
    } as unknown as MouseEvent<HTMLAnchorElement>, navigate);
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledOnce();
  });
  it('shows the whole novel title only when the visible caption is clipped', () => {
    const setAttribute = vi.fn();
    const removeAttribute = vi.fn();
    const element = {
      scrollWidth: 200, clientWidth: 90, scrollHeight: 40, clientHeight: 35,
      setAttribute, removeAttribute,
    };
    revealClippedLinkTitle({currentTarget: element} as never, 'Long book title');
    expect(setAttribute).toHaveBeenCalledWith('title', 'Long book title');
    element.scrollWidth = 90;
    element.scrollHeight = 35;
    revealClippedLinkTitle({currentTarget: element} as never, 'Long book title');
    expect(removeAttribute).toHaveBeenCalledWith('title');
  });
});
