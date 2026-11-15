import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import type { ReaderTheme } from '../types';

/** A route-independent return-to-top control for long catalogues and EPUB pages. */
export default function BackToTop({ theme }: { theme: ReaderTheme }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const update = () => setVisible(window.scrollY > 420);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  if (!visible) return null;
  return <button type="button" className={`page-top-button theme-${theme}`}
    title="Back to top" aria-label="Back to top"
    onClick={() => window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })}>
    <ArrowUp size={20} aria-hidden="true" />
  </button>;
}
