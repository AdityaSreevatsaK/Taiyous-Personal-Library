import type { ReaderTheme } from '../types';

/**
 * One component system, three palettes. Keep the persisted theme IDs stable:
 * older devices already store 'light', 'dark' or 'sepia' in ReaderSettings.
 */
export interface ThemeOption {
  id: ReaderTheme;
  label: string;
  shortLabel: string;
  description: string;
}

export const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
  { id: 'sepia', label: 'Sepia', shortLabel: 'Sepia',
    description: 'Reading-focused parchment. Your recommended default.' },
  { id: 'light', label: 'Paper & Ink', shortLabel: 'Paper',
    description: 'Warm ivory, walnut ink and understated burgundy.' },
  { id: 'dark', label: 'Jade Archive', shortLabel: 'Jade',
    description: 'Deep jade, muted gold and soft cream typography.' },
];

export function themeLabel(id: ReaderTheme): string {
  return THEME_OPTIONS.find(option => option.id === id)?.label ?? 'Sepia';
}
