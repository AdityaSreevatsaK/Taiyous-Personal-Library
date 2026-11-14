import { Check } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { ReaderTheme } from '../types';
import { THEME_OPTIONS, nextReaderTheme, themeById } from '../lib/themes';
import './theme-switcher.css';

interface Props {
  value: ReaderTheme;
  onChange: (theme: ReaderTheme) => void;
  /** Use a single immediately acting control in the cramped reader toolbar. */
  compact?: boolean;
  label?: string;
}

export default function ThemeSwitcher({ value, onChange, compact = false, label = 'Colour theme' }: Props) {
  if (compact) {
    return <button type="button" className="theme-next-button"
      title={`Change colour theme. Current: ${themeById(value).name}`}
      aria-label={`Next colour theme, currently ${themeById(value).name}`}
      onClick={() => onChange(nextReaderTheme(value))}>
      <span className="theme-dot" style={{ background: themeById(value).swatch }} aria-hidden="true" />
      <span className="theme-next-text">{themeById(value).name}</span>
    </button>;
  }

  return <div className="theme-swatches" role="group" aria-label={label}>
    {THEME_OPTIONS.map(option => <button type="button" key={option.id}
      className={`theme-swatch ${option.id === value ? 'is-selected' : ''}`}
      aria-label={`Use ${option.name} theme`}
      title={option.name}
      aria-pressed={option.id === value}
      onClick={() => onChange(option.id)}
      style={{ '--swatch-bg': option.swatch, '--swatch-ink': option.foreground } as CSSProperties}>
      <span className="theme-swatch-circle" aria-hidden="true">
        {option.id === value && <Check size={12} strokeWidth={3} />}
      </span>
    </button>)}
  </div>;
}
