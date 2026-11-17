import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, MOBILE_DEFAULT_SETTINGS, readerDefaultsForViewport } from '../src/types';

describe('responsive reader defaults', () => {
  it('uses Inter 105% on a mobile first run', () => {
    expect(readerDefaultsForViewport(true)).toEqual({
      ...DEFAULT_SETTINGS, font: 'sans', fontSize: 105,
    });
    expect(MOBILE_DEFAULT_SETTINGS.font).toBe('sans');
    expect(MOBILE_DEFAULT_SETTINGS.fontSize).toBe(105);
  });
  it('keeps desktop literary defaults and returns independent copies', () => {
    const desktop = readerDefaultsForViewport(false);
    expect(desktop).toEqual(DEFAULT_SETTINGS);
    expect(desktop.font).toBe('literary');
    expect(desktop.fontSize).toBe(115);
    desktop.fontSize = 160;
    expect(readerDefaultsForViewport(false).fontSize).toBe(115);
  });
});
