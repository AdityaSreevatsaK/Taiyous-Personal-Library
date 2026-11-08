import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readSettings, writeSettings } from '../src/lib/storage';

describe('v0.6 reader width migration', () => {
  const data = new Map<string, string>();

  beforeEach(() => {
    data.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => { data.set(key, String(value)); },
      removeItem: (key: string) => { data.delete(key); },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('widens older saved preferences even when React initialises state twice', () => {
    data.set('folio.reader-settings.v1', JSON.stringify({
      theme: 'sepia', font: 'literary', fontSize: 115,
      lineHeight: 1.65, readingWidth: 760,
    }));
    expect(readSettings().readingWidth).toBe(0);
    expect(readSettings().readingWidth).toBe(0);
    expect(data.get('taiyou.full-width-explicit-v0.6.0')).toBe('yes');
  });

  it('does not override a new custom width after migration', () => {
    const settings = readSettings();
    writeSettings({ ...settings, readingWidth: 1280 });
    expect(readSettings().readingWidth).toBe(1280);
  });
});
