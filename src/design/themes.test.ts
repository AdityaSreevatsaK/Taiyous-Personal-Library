import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, type ReaderTheme } from '../types';
import { THEME_OPTIONS, themeLabel } from './themes';

describe('Taiyou visual design theme contract', () => {
  it('keeps Sepia as the default reading preference', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('sepia');
    expect(DEFAULT_SETTINGS.font).toBe('literary');
    expect(DEFAULT_SETTINGS.readingWidth).toBe(0);
  });

  it('retains every existing persisted theme ID', () => {
    const ids = THEME_OPTIONS.map(option => option.id);
    expect(new Set(ids).size).toBe(3);
    expect([...ids].sort()).toEqual(['dark', 'light', 'sepia']);
  });

  it('names the new light/dark palettes without remapping saved preferences', () => {
    expect(themeLabel('light')).toBe('Paper & Ink');
    expect(themeLabel('dark')).toBe('Jade Archive');
    expect(themeLabel('sepia')).toBe('Sepia');
  });

  it('provides accessible descriptions and concise sidebar labels', () => {
    for (const option of THEME_OPTIONS) {
      expect(option.description.length).toBeGreaterThan(15);
      expect(option.shortLabel.length).toBeLessThanOrEqual(6);
      expect(themeLabel(option.id as ReaderTheme)).toBe(option.label);
    }
  });
});
