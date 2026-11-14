import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import ePub from 'epubjs';
import {
  ArrowLeft, BookOpen, Check, ChevronDown, ChevronLeft, ChevronRight, List, Minus,
  Moon, PanelRightClose, Plus, Search, Settings2, SlidersHorizontal, Sun, Type, X,
} from 'lucide-react';
import { DEFAULT_SETTINGS, type ChapterItem, type LibraryBook, type ReaderSettings } from '../types';
import { THEME_OPTIONS, themeById } from '../lib/themes';
import ThemeSwitcher from './ThemeSwitcher';
import { approximateProgress, chapterIndexForHref, findChapter, firstRealChapterIndex, flattenToc, nextChapterHref, type NavigationNode, normalizeChapterHref } from '../lib/chapters';
import { getBookFile } from '../lib/storage';

interface Props {
  book: LibraryBook;
  settings: ReaderSettings;
  onSettings: (settings: ReaderSettings) => void;
  onBack: () => void;
  onNovelDetails: () => void;
  initialChapterHref?: string;
  onProgress: (patch: Partial<LibraryBook>) => void;
}

// Serif for extended fiction reading, with a high-legibility sans option.
// These are progressive enhancements: every font has an offline system fallback.
const FONTS: Record<ReaderSettings['font'], string> = {
  literary: '"Literata", Georgia, "Times New Roman", serif',
  classic: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
  georgia: 'Georgia, "Times New Roman", serif',
  sans: '"Inter", "Segoe UI", Arial, sans-serif',
  clear: '"Atkinson Hyperlegible Next", "Segoe UI", Arial, sans-serif',
};

// Only a font CSS request is sent to Google Fonts, never novel contents.
const FONT_STYLESHEET = 'https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;500;600;700&family=Inter:wght@400;500;600;700&family=Literata:wght@400;500;600;700&display=swap';

function applyAppearance(rendition: any, settings: ReaderSettings) {
  const current = themeById(settings.theme);
  const tone = { foreground: current.ink, background: current.paper, muted: current.muted };
  const font = FONTS[settings.font] || FONTS.literary;
  // EPUB content is rendered inside an iframe. Its width and internal padding
  // must be controlled here: the app's ordinary CSS cannot style that document.
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches;
  rendition.themes.register('taiyou-theme', {
    html: {
      background: `${tone.background} !important`,
      width: '100% !important',
      'max-width': 'none !important',
      margin: '0 !important',
      'box-sizing': 'border-box !important',
      'overflow-x': 'hidden !important',
    },
    body: {
      background: `${tone.background} !important`,
      color: `${tone.foreground} !important`,
      // EPUB-supplied styles may set max-width and margins on its own body.
      // Fix the document, not only the outer React container.
      width: '100% !important',
      'max-width': 'none !important',
      'min-width': '0 !important',
      'overflow-x': 'hidden !important',
      'overflow-wrap': 'anywhere !important',
      margin: '0 !important',
      'box-sizing': 'border-box !important',
      'font-family': `${font} !important`,
      'line-height': `${settings.lineHeight} !important`,
      'text-align': 'left !important',
      padding: narrow ? '14px 8px 26px !important' : '24px 14px 44px !important',
    },
    'body p': {
      'max-width': 'none !important',
      color: `${tone.foreground} !important`,
      'font-family': `${font} !important`,
      'line-height': `${settings.lineHeight} !important`,
      'text-align': 'left !important',
    },
    a: { color: `${tone.foreground} !important` },
    img: { 'max-width': '100% !important', height: 'auto !important' },
  });
  rendition.themes.select('taiyou-theme');
  rendition.themes.font(font);
  rendition.themes.fontSize(`${settings.fontSize}%`);
}

export default function Reader({ book, settings, onSettings, onBack, onNovelDetails, onProgress, initialChapterHref }: Props) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const bookRef = useRef<any>(null);
  const renditionRef = useRef<any>(null);
  const progressRef = useRef(onProgress);
  const settingsRef = useRef(settings);
  const [toc, setToc] = useState<ChapterItem[]>([]);
  const [activeHref, setActiveHref] = useState('');
  const [chapter, setChapter] = useState(book.currentChapter || 'Opening your book…');
  const [progress, setProgress] = useState(book.progress);
  const [panel, setPanel] = useState<'toc' | 'settings' | null>(null);
  const [tocSearch, setTocSearch] = useState('');
  const [chapterPickerOpen, setChapterPickerOpen] = useState(false);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);

  useEffect(() => { progressRef.current = onProgress; }, [onProgress]);
  useEffect(() => { settingsRef.current = settings; if (renditionRef.current) applyAppearance(renditionRef.current, settings); }, [settings]);

  useEffect(() => {
    let cancelled = false;
    let renderer: any = null;
    let epubBook: any = null;
    async function open() {
      try {
        setLoading(true);
        const file = await getBookFile(book.id);
        if (cancelled) return;
        const contents = await file.arrayBuffer();
        if (cancelled) return;
        epubBook = ePub(contents);
        await epubBook.ready;
        if (cancelled) return;
        bookRef.current = epubBook;
        const navigation = await epubBook.loaded.navigation;
        if (cancelled) return;
        const chapters = flattenToc((navigation.toc || []) as NavigationNode[]);
        const fallback: ChapterItem[] = epubBook.spine.spineItems.map((item: any, index: number) => ({ label: `Section ${index + 1}`, href: item.href, level: 0 }));
        const actualToc = chapters.length ? chapters : fallback;
        setToc(actualToc);
        if (!viewportRef.current) return;
        renderer = epubBook.renderTo(viewportRef.current, {
          width: '100%', height: '100%', flow: 'scrolled-doc', manager: 'default',
          spread: 'none', allowScriptedContent: false, allowPopups: false,
        });
        renditionRef.current = renderer;
        // Apply per-chapter adjustments inside the EPUB document (not the app's iframe).
        // Some NovelFull/FanFicFare EPUBs preserve blank, src-less advertisement
        // iframes at both ends of each chapter. Hide them without removing nodes:
        // deleting EPUB DOM nodes can invalidate existing CFI reading bookmarks.
        renderer.hooks.content.register((contents: any) => {
          const doc = contents?.document as Document | undefined;
          if (!doc?.head) return;

          if (!doc.querySelector('style[data-taiyou-hide-empty-embeds]')) {
            const cleanup = doc.createElement('style');
            cleanup.setAttribute('data-taiyou-hide-empty-embeds', '');
            cleanup.textContent = `
              html, body { overflow-x: hidden !important; max-width: 100% !important; }
              body { overflow-wrap: anywhere !important; word-wrap: break-word !important; }
              img, svg, video, table { max-width: 100% !important; }
              pre, code { white-space: pre-wrap !important; overflow-wrap: anywhere !important; }
              /* EPUBs use h1-h4, classed paragraphs, or plain "Chapter N" lines.
                 Apply only to headings, never ordinary story paragraphs. */
              h1, h2, h3, h4,
              .chapter-title, .chapterTitle, .chapter-heading, .chapterHeading,
              .chapter_name, .chapterName, .chap-title, .taiyou-chapter-heading {
                display: block !important;
                text-align: center !important;
                font-size: 1.5em !important;
                line-height: 1.3 !important;
                font-weight: 650 !important;
                margin: 1.15em auto 1.25em !important;
                max-width: 90% !important;
              }
              .taiyou-chapter-heading *, h1 *, h2 *, h3 *, h4 * {
                text-align: center !important;
              }
              iframe:not([src]):not([srcdoc]),
              iframe[src=""]:not([srcdoc]) {
                display: none !important;
                width: 0 !important;
                height: 0 !important;
                min-height: 0 !important;
                border: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
              }
            `;
            doc.head.appendChild(cleanup);
          }

          // Some EPUBs render the chapter heading as a plain left-aligned
          // paragraph or div. Mark only an early, short, recognisable heading.
          // Do not change its text or remove nodes (existing CFI stays valid).
          const openingBlocks = Array.from(
            doc.body?.querySelectorAll('h1, h2, h3, h4, p, div') || [],
          ).slice(0, 24);
          for (const node of openingBlocks) {
            const title = (node.textContent || '').replace(/\s+/g, ' ').trim();
            if (title.length > 140 || title.length < 3) continue;
            if (/^(?:chap(?:ter)?\.?|ch\.)\s*(?:\d+|[IVXLCDM]+)\b|^第.{1,20}[章节回]|^(?:prologue|epilogue)\b/i.test(title)) {
              node.classList.add('taiyou-chapter-heading');
              break;
            }
          }

          // Browser/system font fallbacks keep the reader functional offline.
          if (!doc.querySelector('link[data-taiyou-fonts]')) {
            const stylesheet = doc.createElement('link');
            stylesheet.setAttribute('data-taiyou-fonts', '');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = FONT_STYLESHEET;
            doc.head.appendChild(stylesheet);
          }
        });
        applyAppearance(renderer, settingsRef.current);
        renderer.on('relocated', (location: any) => {
          if (cancelled || !location?.start) return;
          const href = location.start.href || '';
          const index = Number(location.start.index ?? 0);
          const display = location.start.displayed || { page: 1, total: 1 };
          const total = epubBook.spine.spineItems?.length || 1;
          const nextProgress = approximateProgress(index, total, display.page, display.total);
          const match = findChapter(actualToc, href);
          const chapterName = match?.label || `Section ${index + 1}`;
          const offset = firstRealChapterIndex(actualToc, book.chapterCount);
          const chapterNumber = chapterIndexForHref(actualToc.slice(offset), href) + 1;
          setActiveHref(href);
          setChapter(chapterName);
          setProgress(nextProgress);
          progressRef.current({ lastCfi: location.start.cfi, progress: nextProgress,
            currentChapter: chapterName, currentChapterIndex: index,
            currentChapterNumber: chapterNumber > 0 ? chapterNumber : undefined,
            lastOpenedAt: Date.now() });
        });
        renderer.on('displayError', (reason: unknown) => {
          if (!cancelled) setError(`Unable to display this section: ${String(reason)}`);
        });
        const frontMatterOffset = firstRealChapterIndex(actualToc, book.chapterCount);
        const firstChapter = frontMatterOffset ? actualToc[frontMatterOffset]?.href : undefined;
        try {
          // Direct chapter selection from Novel Details takes priority over Resume.
          await renderer.display(initialChapterHref || book.lastCfi || firstChapter || undefined);
        } catch (previousPositionError) {
          // A TOC target can be invalid in a malformed EPUB; fall back to its
          // beginning, not to the old saved position that the user bypassed.
          if (initialChapterHref || book.lastCfi) await renderer.display(firstChapter || undefined);
          else throw previousPositionError;
        }
        if (!cancelled) setLoading(false);
      } catch (reason) {
        if (!cancelled) { setError(reason instanceof Error ? reason.message : String(reason)); setLoading(false); }
      }
    }
    void open();
    return () => {
      cancelled = true;
      renditionRef.current = null;
      bookRef.current = null;
      // A queued EPUB.js display can outlive this React reader. Stop its
      // rendition queue before Book.destroy() clears locations, avoiding an
      // asynchronous crash during rapid navigation or offline re-opening.
      if (renderer) {
        try { renderer.q?.stop(); } catch { /* already detached */ }
        renderer.book = undefined;
        try { renderer.destroy(); } catch { /* best-effort iframe cleanup */ }
      }
      if (epubBook) {
        if (renderer && epubBook.rendition === renderer) epubBook.rendition = undefined;
        try { epubBook.destroy(); } catch { /* already closing */ }
      }
    };
    // Intentionally initialize only when the selected book changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id]);

  // In scrolled-doc mode, each EPUB spine section is a vertically scrolling document.
  // Navigate via table-of-contents targets, not page turns, so each new chapter
  // starts at the top instead of continuing inside a paginated chapter.
  const frontMatterOffset = firstRealChapterIndex(toc, book.chapterCount);
  const chapters = toc.slice(frontMatterOffset);
  const currentChapterIndex = chapterIndexForHref(chapters, activeHref);
  const turn = useCallback(async (direction: 'next' | 'prev') => {
    if (!renditionRef.current || moving || loading) return;
    // Previously saved EPUB positions can point to an old title page. In that
    // case, Next Chapter should still take the reader to Chapter 1.
    const href = direction === 'next' && chapterIndexForHref(chapters, activeHref) < 0
      ? chapters[0]?.href : nextChapterHref(chapters, activeHref, direction);
    if (!href) return;
    setMoving(true);
    try {
      await renditionRef.current.display(href);
    } catch (reason) {
      setError(`Could not open ${direction === 'next' ? 'next' : 'previous'} chapter: ${String(reason)}`);
    } finally { setMoving(false); }
  }, [chapters, activeHref, moving, loading]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      const node = event.target as HTMLElement | null;
      if (node && (node.tagName === 'INPUT' || node.tagName === 'SELECT' || node.tagName === 'BUTTON' || node.isContentEditable)) return;
      if (panel || chapterPickerOpen) return;
      if (event.key === 'ArrowRight') { event.preventDefault(); void turn('next'); }
      if (event.key === 'ArrowLeft') { event.preventDefault(); void turn('prev'); }
      if (event.key === 'Escape') setPanel(null);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [panel, chapterPickerOpen, turn]);

  useEffect(() => {
    // EPUB.js owns its iframe dimensions. Resizing the CSS container alone is
    // not sufficient when choosing another reading-width preset.
    let pending = 0;
    const resize = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        try {
          if (renditionRef.current) {
            renditionRef.current.resize();
            applyAppearance(renditionRef.current, settingsRef.current);
          }
        } catch { /* the reader can be closing while a resize occurs */ }
      });
    };
    const observer = typeof ResizeObserver !== 'undefined' && viewportRef.current
      ? new ResizeObserver(resize) : null;
    if (viewportRef.current) observer?.observe(viewportRef.current);
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(pending);
    };
  }, []);

  async function jump(href: string) {
    if (!href || !renditionRef.current || moving || loading) return;
    setMoving(true);
    try { await renditionRef.current.display(href); setPanel(null); setChapterPickerOpen(false); }
    catch (reason) { setError(`Could not open chapter: ${String(reason)}`); }
    finally { setMoving(false); }
  }

  const displayedChapterIndex = currentChapterIndex + 1;
  const chapterSearchQuery = chapterSearch.trim().toLocaleLowerCase();
  // EPUBs can have 4,000+ entries. Keep the DOM list bounded and provide
  // both text search and direct numeric chapter navigation.
  const chapterMatches = chapterSearchQuery
    ? chapters.map((item, index) => ({ item, index }))
      .filter(({ item, index }) => item.label.toLocaleLowerCase().includes(chapterSearchQuery) || String(index + 1) === chapterSearchQuery)
      .slice(0, 80)
    : chapters.slice(Math.max(0, currentChapterIndex - 15), Math.min(chapters.length, Math.max(0, currentChapterIndex - 15) + 60))
      .map((item, index) => ({ item, index: index + Math.max(0, currentChapterIndex - 15) }));
  const chapterNumberIndex = Number(chapterNumber) - 1;
  const validChapterNumber = Number.isInteger(chapterNumberIndex) && chapterNumberIndex >= 0 && chapterNumberIndex < chapters.length;
  const openChapterPicker = () => {
    setPanel(null);
    setChapterSearch('');
    setChapterNumber(String(Math.max(1, currentChapterIndex + 1)));
    setChapterPickerOpen(true);
  };
  const displayedChapterCount = chapters.length || book.chapterCount || toc.length;
  const filteredToc = toc.filter((item) => item.label.toLowerCase().includes(tocSearch.trim().toLowerCase()));
  const change = (next: Partial<ReaderSettings>) => onSettings({ ...settings, ...next });

  return (
    <div className={`reader-shell theme-${settings.theme}`} style={{ '--reading-width': settings.readingWidth === 0 ? 'none' : `${settings.readingWidth}px` } as CSSProperties}>
      <header className="reader-header">
        <div className="reader-head-left">
          <button className="reader-back icon-button" onClick={onNovelDetails} title="Back to novel details" aria-label="Back to novel details"><ArrowLeft size={19} /></button>
          <div className="reader-divider" />
          <button type="button" className="reader-brand reader-home-link" onClick={onBack} title="Go to library home" aria-label="Go to library home"><BookOpen size={20} /></button>
        </div>
        <div className="reader-head-center" aria-live="polite" aria-atomic="true">
          <button type="button" className="reader-novel-link" onClick={onNovelDetails} title="Go to novel details" aria-label={`Go to ${book.title} details`}>{book.title}</button>
          <small>{currentChapterIndex >= 0 ? `Chapter ${displayedChapterIndex} of ${displayedChapterCount}` : chapter} <span className="reader-progress-percent"> · {Math.round(progress)}% read</span></small>
        </div>
        <nav className="reader-head-right" aria-label="Reader controls">
          <button className={`icon-button ${panel === 'toc' ? 'reader-active' : ''}`} onClick={() => setPanel(panel === 'toc' ? null : 'toc')} title="Table of contents" aria-label="Table of contents"><List size={20} /></button>
          <ThemeSwitcher compact value={settings.theme} onChange={theme => change({ theme })} />
           <button className={`icon-button ${panel === 'settings' ? 'reader-active' : ''}`} onClick={() => setPanel(panel === 'settings' ? null : 'settings')} title="Reading preferences" aria-label="Reading preferences"><Settings2 size={19} /></button>
        </nav>
        <div className="reader-header-progress" role="progressbar" aria-label="Book progress" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
        </div>
      </header>
      <div className="reader-main"><div className="reader-content"><div className="reader-page" ref={viewportRef} />{loading && <div className="reader-loading"><div className="loader-icon"><BookOpen size={30} /></div><strong>Opening your story…</strong><p>Preparing the pages of {book.title}</p></div>}{error && <div className="reader-error" role="alert"><strong>Something went wrong</strong><p>{error}</p><button className="secondary-button" onClick={onBack}>Return to library</button></div>}</div></div>
      <nav className="reader-chapter-footer" aria-label="Chapter navigation">
        <button className="reader-chapter-button reader-chapter-previous" type="button"
          disabled={loading || moving || !!error || currentChapterIndex <= 0}
          onClick={() => void turn('prev')} title="Previous chapter (Left arrow)" aria-label="Previous chapter">
          <ChevronLeft size={19} /><span>Previous chapter</span>
        </button>
        <button type="button" className="reader-footer-jump" aria-label="Jump to chapter"
          aria-haspopup="dialog" aria-expanded={chapterPickerOpen}
          disabled={loading || moving || !!error || !chapters.length} onClick={openChapterPicker}>
          <span>{currentChapterIndex >= 0
            ? `${displayedChapterIndex} / ${displayedChapterCount} · ${chapters[currentChapterIndex].label}`
            : 'Choose chapter'}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
        <button className="reader-chapter-button reader-chapter-next" type="button"
          disabled={loading || moving || !!error || (currentChapterIndex >= chapters.length - 1 && currentChapterIndex >= 0)}
          onClick={() => void turn('next')} title="Next chapter (Right arrow)" aria-label="Next chapter">
          <span>Next chapter</span><ChevronRight size={19} />
        </button>
      </nav>


      {chapterPickerOpen && <div className="reader-chapter-picker-shade" onMouseDown={event => {
        if (event.target === event.currentTarget) setChapterPickerOpen(false);
      }}>
        <section className="reader-chapter-picker" role="dialog" aria-modal="true" aria-label="Choose chapter"
          onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setChapterPickerOpen(false); } }}>
          <header className="reader-chapter-picker-header">
            <div><span className="section-overline">CHAPTER NAVIGATION</span><h2>Jump to a chapter</h2>
              <p>{chapters.length.toLocaleString()} chapters · Current: {currentChapterIndex >= 0 ? displayedChapterIndex : 'Not started'}</p>
            </div>
            <button type="button" className="icon-button" aria-label="Close chapter picker" onClick={() => setChapterPickerOpen(false)}><X size={20} /></button>
          </header>
          <form className="reader-chapter-number" onSubmit={event => {
            event.preventDefault();
            if (validChapterNumber) void jump(chapters[chapterNumberIndex].href);
          }}>
            <label htmlFor="reader-chapter-number-input">Go to chapter number</label>
            <div><input id="reader-chapter-number-input" type="number" min={1} max={chapters.length} step={1}
              aria-label="Chapter number" value={chapterNumber} onChange={event => setChapterNumber(event.target.value)} />
              <button type="submit" className="primary-button" disabled={!validChapterNumber || moving}>Go</button></div>
          </form>
          <label className="reader-chapter-search"><Search size={17} />
            <input type="search" aria-label="Search chapter titles" placeholder="Search chapters by title or number…"
              value={chapterSearch} onChange={event => setChapterSearch(event.target.value)} />
          </label>
          <div className="reader-chapter-picker-list">
            {chapterMatches.map(({ item, index }) => <button type="button" key={`${index}-${item.href}`}
              className={index === currentChapterIndex ? 'chapter-picker-result active' : 'chapter-picker-result'}
              aria-current={index === currentChapterIndex ? 'true' : undefined}
              disabled={moving} onClick={() => void jump(item.href)}>
              <span className="chapter-picker-number">{index + 1}</span><span>{item.label}</span>
              {index === currentChapterIndex && <Check size={15} />}
            </button>)}
            {!chapterMatches.length && <p className="toc-no-results">No matching chapters.</p>}
          </div>
          <footer className="reader-chapter-picker-footnote">
            {chapterSearchQuery
              ? `Showing up to 80 matches. Use chapter number for direct navigation.`
              : `Showing chapters near your current position. Search or enter a number to jump anywhere.`}
          </footer>
        </section>
      </div>}

      {panel && <><button className="reader-panel-shade" aria-label="Close panel" onClick={() => setPanel(null)} /><aside className="reader-panel" aria-label={panel === 'toc' ? 'Table of contents' : 'Reader preferences'}><div className="panel-header"><div><span className="section-overline">{panel === 'toc' ? 'NAVIGATION' : 'MAKE IT YOUR OWN'}</span><h2>{panel === 'toc' ? 'Contents' : 'Appearance'}</h2></div><button className="icon-button" onClick={() => setPanel(null)} aria-label="Close panel"><X size={20} /></button></div>{panel === 'toc' ? <><label className="toc-search"><Search size={17} /><input placeholder="Find a chapter…" value={tocSearch} onChange={(e) => setTocSearch(e.target.value)} /></label><div className="toc-list">{filteredToc.map((item, index) => { const active = normalizeChapterHref(item.href) === normalizeChapterHref(activeHref); return <button key={`${index}-${item.href}`} onClick={() => void jump(item.href)} className={`toc-item ${active ? 'active' : ''}`} style={{ paddingLeft: `${18 + Math.min(item.level, 3) * 13}px` }}><span className="toc-chapter-icon">{active ? <BookOpen size={15} /> : <span>·</span>}</span><span>{item.label}</span>{active && <Check size={15} />}</button>; })}{!filteredToc.length && <div className="toc-no-results">No matching chapters found.</div>}</div><div className="panel-footer">{toc.length} entries in this book</div></> : <div className="settings-content"><div className="setting-group"><label className="setting-label">READING THEME</label><div className="theme-options">{THEME_OPTIONS.map(option => <button type="button" key={option.id}
  className={`theme-choice choice-${option.id} ${settings.theme === option.id ? 'selected' : ''}`}
  aria-label={`Use ${option.name} reading theme`} aria-pressed={settings.theme === option.id}
  onClick={() => change({ theme: option.id })}>
  <span className="theme-dot" style={{ background: option.swatch }} aria-hidden="true" />
  <span>{option.name}</span>{settings.theme === option.id && <Check size={14} />}
</button>)}</div></div><div className="setting-group"><label className="setting-label" htmlFor="font-family-select">FONT FAMILY</label><div className="styled-select"><Type size={18} /><select id="font-family-select" value={settings.font} onChange={(e) => change({ font: e.target.value as ReaderSettings['font'] })}><option value="literary">Literata · Recommended</option><option value="georgia">Georgia · Familiar serif</option><option value="classic">Palatino · Classic serif</option><option value="sans">Inter · Modern sans</option><option value="clear">Atkinson · High legibility</option></select><ChevronRight size={17} /></div></div><div className="setting-group"><label className="setting-label">FONT SIZE</label><div className="font-stepper"><button onClick={() => change({ fontSize: Math.max(75, settings.fontSize - 10) })} aria-label="Decrease font size"><Minus size={19} /></button><span><Type size={20} />{settings.fontSize}%</span><button onClick={() => change({ fontSize: Math.min(170, settings.fontSize + 10) })} aria-label="Increase font size"><Plus size={19} /></button></div></div><div className="setting-group"><div className="setting-row"><label className="setting-label" htmlFor="line-height">LINE SPACING</label><span>{settings.lineHeight.toFixed(2)}×</span></div><input id="line-height" type="range" min="1.3" max="2.2" step="0.05" value={settings.lineHeight} onChange={(e) => change({ lineHeight: Number(e.target.value) })} /></div><div className="setting-group"><div className="setting-row"><span className="setting-label">READING WIDTH</span><span>{settings.readingWidth === 0 ? 'Full screen' : `${settings.readingWidth}px`}</span></div><div className="width-options" role="group" aria-label="Reading width"><button type="button" className={`width-choice ${settings.readingWidth === 760 ? 'selected' : ''}`} onClick={() => change({ readingWidth: 760 })} aria-pressed={settings.readingWidth === 760}>Comfortable</button><button type="button" className={`width-choice ${settings.readingWidth === 1280 ? 'selected' : ''}`} onClick={() => change({ readingWidth: 1280 })} aria-pressed={settings.readingWidth === 1280}>Wide</button><button type="button" className={`width-choice ${settings.readingWidth === 0 ? 'selected' : ''}`} onClick={() => change({ readingWidth: 0 })} aria-pressed={settings.readingWidth === 0}>Full width</button></div><label htmlFor="page-width" className="width-custom-label">Or customise maximum width</label><input id="page-width" type="range" min="520" max="1600" step="20" value={settings.readingWidth === 0 ? 1600 : settings.readingWidth} onChange={(e) => change({ readingWidth: Number(e.target.value) })} aria-label="Custom reading width in pixels" /><p className="setting-help">Full width uses almost the entire screen while retaining small edge margins. Your preference is saved automatically.</p></div><div className="settings-note"><SlidersHorizontal size={17} />Your preferences are saved automatically on this device.</div><button className="reset-settings" onClick={() => onSettings({ ...DEFAULT_SETTINGS })}>Reset to defaults <PanelRightClose size={16} /></button></div>}</aside></>}
    </div>
  );
}
