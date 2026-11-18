import { useEffect, useState } from 'react';

/** Subtle document-scroll position indicator for novel detail pages only.
 * Native scrolling, wheel chaining and the EPUB reader remain unchanged. */
export default function DetailsScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setScrollable(max > 24);
      setProgress(max > 0 ? Math.min(100, Math.max(0, Math.round(100 * window.scrollY / max))) : 0);
    };
    const schedule = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer) observer.observe(document.body);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return <div className="details-page-scroll-meter" data-progress={progress}
    aria-hidden="true" style={{ opacity: scrollable ? 1 : 0 }}>
    <div className="details-page-scroll-fill" style={{ transform: `scaleX(${progress / 100})` }} />
  </div>;
}
