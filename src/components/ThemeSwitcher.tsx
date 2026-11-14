import { Check, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { ReaderTheme } from '../types';
import { THEME_OPTIONS, themeById } from '../lib/themes';
import './theme-switcher.css';

interface Props {
  value: ReaderTheme;
  onChange: (theme: ReaderTheme) => void;
  /** Compact controls open a menu; theme changes only after explicit choice. */
  compact?: boolean;
  label?: string;
}

export default function ThemeSwitcher({ value, onChange, compact = false, label = 'Colour theme' }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (compact) {
    return <div className="theme-menu-root" ref={root}>
      <button type="button" className="theme-next-button"
        aria-haspopup="true" aria-expanded={open} aria-controls="taiyou-theme-options"
        title={`Choose colour theme. Current: ${themeById(value).name}`}
        aria-label={`Choose colour theme, currently ${themeById(value).name}`}
        onClick={() => setOpen(previous => !previous)}>
        <span className="theme-dot" style={{ background: themeById(value).swatch }} aria-hidden="true" />
        <span className="theme-next-text">{themeById(value).name}</span>
        <ChevronDown size={13} aria-hidden="true" />
      </button>
      {open && <div id="taiyou-theme-options" className="theme-menu-panel" role="group" aria-label="Choose reading colour theme">
        <span className="theme-menu-caption">CHOOSE A THEME</span>
        <div className="theme-menu-grid">{THEME_OPTIONS.map(option =>
          <button key={option.id} type="button" className="theme-menu-choice"
            aria-label={`Use ${option.name} theme`} aria-pressed={value === option.id}
            onClick={() => { onChange(option.id); setOpen(false); }}>
            <span className="theme-menu-preview" style={{ background: option.swatch, color: option.foreground }} aria-hidden="true">
              {value === option.id && <Check size={15} strokeWidth={3}/>}
            </span>
            <span>{option.name}</span>
          </button>
        )}</div>
      </div>}
    </div>;
  }

  return <div className="theme-swatches" role="group" aria-label={label}>
    {THEME_OPTIONS.map(option => <button type="button" key={option.id}
      className={`theme-swatch ${option.id === value ? 'is-selected' : ''}`}
      aria-label={`Use ${option.name} theme`}
      title={option.name} aria-pressed={option.id === value}
      onClick={() => onChange(option.id)}
      style={{ '--swatch-bg': option.swatch, '--swatch-ink': option.foreground } as CSSProperties}>
      <span className="theme-swatch-circle" aria-hidden="true">
        {option.id === value && <Check size={12} strokeWidth={3} />}
      </span>
    </button>)}
  </div>;
}
