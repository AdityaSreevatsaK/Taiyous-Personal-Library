import type { ReaderTheme } from '../types';

export interface ThemeOption {
  id: ReaderTheme;
  name: string;
  /** Swatch represents the main reading/background colour, not a separate setting. */
  swatch: string;
  foreground: string;
  /** EPUB iframe colours must agree with the selected outer reader theme. */
  paper: string;
  ink: string;
  muted: string;
}

export const THEME_OPTIONS: readonly ThemeOption[] = [
  { id: 'sepia', name: 'Sepia', swatch: '#e9d5b7', foreground: '#46382a', paper: '#f4ead7', ink: '#4a3c2e', muted: '#766453' },
  { id: 'light', name: 'Paper', swatch: '#f9f9f7', foreground: '#27303b', paper: '#fffefa', ink: '#252a2a', muted: '#626762' },
  { id: 'dark', name: 'Charcoal', swatch: '#30343c', foreground: '#f2f4f8', paper: '#22252c', ink: '#e0e4eb', muted: '#adb3bf' },
  { id: 'midnight', name: 'Midnight', swatch: '#12213b', foreground: '#e7edf9', paper: '#12213b', ink: '#e8effa', muted: '#b6c4da' },
  { id: 'ocean', name: 'Ocean', swatch: '#dcecf6', foreground: '#244464', paper: '#e8f3fb', ink: '#244464', muted: '#58738c' },
  { id: 'plum', name: 'Plum', swatch: '#332638', foreground: '#f5e7f2', paper: '#302536', ink: '#f2e9f4', muted: '#c2aac6' },
] as const;

export const THEME_IDS: readonly ReaderTheme[] = THEME_OPTIONS.map(option => option.id);

export function isReaderTheme(value: unknown): value is ReaderTheme {
  return typeof value === 'string' && THEME_IDS.some(theme => theme === value);
}

export function nextReaderTheme(theme: ReaderTheme): ReaderTheme {
  return THEME_IDS[(THEME_IDS.indexOf(theme) + 1) % THEME_IDS.length];
}

export function themeById(theme: ReaderTheme): ThemeOption {
  return THEME_OPTIONS.find(option => option.id === theme) ?? THEME_OPTIONS[0];
}
