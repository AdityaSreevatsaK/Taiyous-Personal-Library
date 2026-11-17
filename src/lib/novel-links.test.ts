import { describe, expect, it, vi } from 'vitest';
import { openNovelInCurrentTab } from './novel-links';
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
