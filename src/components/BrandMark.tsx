import type { ReaderTheme } from '../types';

/** Theme-aware, approved Taiyou sun mark. No surrounding icon tile. */
export default function BrandMark({ size = 36, theme }: { size?: number; theme: ReaderTheme }) {
  const variant = theme === 'light' || theme === 'ocean' || theme === 'sepia' ? 'light' : 'dark';
  return <img className="taiyou-brand-mark" src={`/branding/sun-${variant}.webp`}
    width={size} height={size} alt="" aria-hidden="true" draggable={false}
    style={{ width: size, height: size }} />;
}
