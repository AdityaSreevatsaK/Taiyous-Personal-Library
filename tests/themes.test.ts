import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/types';
import { THEME_IDS, THEME_OPTIONS, isReaderTheme, nextReaderTheme, themeById } from '../src/lib/themes';
import { readSettings, writeSettings } from '../src/lib/storage';

describe('six one-tap reader palettes', () => {
  it('has unique, valid, complete themes and EPUB paper/ink values', () => {
    expect(THEME_IDS).toEqual(['sepia', 'light', 'dark', 'midnight', 'ocean', 'plum']);
    expect(new Set(THEME_IDS).size).toBe(6);
    for (const theme of THEME_OPTIONS) {
      expect(isReaderTheme(theme.id)).toBe(true);
      expect(theme.name.length).toBeGreaterThan(2);
      expect(theme.paper).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.ink).toMatch(/^#[0-9a-f]{6}$/);
      expect(theme.swatch).toMatch(/^#[0-9a-f]{6}$/);
      expect(themeById(theme.id)).toBe(theme);
    }
    expect(isReaderTheme('jade')).toBe(false);
    expect(isReaderTheme(null)).toBe(false);
    expect(isReaderTheme('__proto__')).toBe(false);
  });
  it('cycles through all six choices and returns to original', () => {
    let theme = DEFAULT_SETTINGS.theme;
    const visited = [];
    for (let i = 0; i < THEME_IDS.length; i++) {
      visited.push(theme);
      theme = nextReaderTheme(theme);
    }
    expect(theme).toBe(DEFAULT_SETTINGS.theme);
    expect(visited).toEqual(THEME_IDS);
  });
});

describe('persisted settings retain new themes without changing other preferences', () => {
  let values: Map<string, string>;
  beforeEach(() => {
    values = new Map([
      ['taiyou.sepia-default-applied.v0.3.0', 'yes'],
      ['taiyou.full-width-default-applied.v0.4.0', 'yes'],
      ['taiyou.full-width-explicit-v0.6.0', 'yes'],
    ]);
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each(THEME_IDS)('persists %s after a fresh read', theme => {
    const settings = { ...DEFAULT_SETTINGS, theme, fontSize: 130, lineHeight: 1.85 };
    writeSettings(settings);
    expect(readSettings()).toEqual(settings);
  });
  it('rejects corrupted theme settings safely', () => {
    values.set('folio.reader-settings.v1', JSON.stringify({ theme: 'invalid', fontSize: 115, readingWidth: 0 }));
    expect(readSettings().theme).toBe('sepia');
  });
  it('preserves the historical default without overwriting a deliberate choice', () => {
    expect(readSettings().theme).toBe('sepia');
    writeSettings({ ...DEFAULT_SETTINGS, theme: 'midnight' });
    expect(readSettings().theme).toBe('midnight');
  });
});
