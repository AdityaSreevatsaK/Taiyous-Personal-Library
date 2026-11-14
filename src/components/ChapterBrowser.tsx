import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BookMarked, ChevronLeft, ChevronRight, List, Search } from 'lucide-react';
import { CHAPTERS_PER_PAGE, loadChapterCatalog, resolveChapterNumber, searchChapterCatalog } from '../lib/catalog';
import type { ChapterItem, LibraryBook } from '../types';

interface Props {
  book: LibraryBook;
  onReadChapter: (href: string) => void;
  isCachedOffline: boolean;
  onLoadChapters: () => Promise<void>;
}

/** Chapter selection on the novel's details page (before entering the reader). */
export default function ChapterBrowser({ book, onReadChapter, isCachedOffline, onLoadChapters }: Props) {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(isCachedOffline);
  const [preparing, setPreparing] = useState(false);
  const [nearViewport, setNearViewport] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [page, setPage] = useState(0);
  const [invalidNumber, setInvalidNumber] = useState(false);

  useEffect(() => {
    setNearViewport(false);
    if (!isCachedOffline) return;
    if (typeof IntersectionObserver === 'undefined') { setNearViewport(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: '280px' });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, [book.id, isCachedOffline]);

  useEffect(() => {
    if (isCachedOffline && !nearViewport) return;
    let active = true;
    setError(null);
    setChapters([]);
    setPage(0);
    if (!isCachedOffline) { setLoading(false); return () => { active = false; }; }
    setLoading(true);
    void loadChapterCatalog(book.id, book.chapterCount).then((list) => {
      if (!active) return;
      setChapters(list);
      setLoading(false);
      if (!list.length) setError('This EPUB has no readable chapter entries. Use the reader’s table of contents instead.');
    }).catch((reason: unknown) => {
      if (!active) return;
      setError(`Chapter list unavailable: ${reason instanceof Error ? reason.message : String(reason)}`);
      setLoading(false);
    });
    return () => { active = false; };
  }, [book.id, isCachedOffline, nearViewport]); // Defer large EPUB parsing until chapters are near view.

  async function prepareChapters() {
    if (preparing || isCachedOffline) return;
    setPreparing(true);
    setError(null);
    try {
      await onLoadChapters();
    } catch (reason) {
      setError(`Unable to prepare chapters: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally { setPreparing(false); }
  }

  const filtered = useMemo(() => searchChapterCatalog(chapters, search), [chapters, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / CHAPTERS_PER_PAGE));
  const shown = filtered.slice(page * CHAPTERS_PER_PAGE, (page + 1) * CHAPTERS_PER_PAGE);
  const currentNumber = book.currentChapterNumber || 0;

  function goToNumber(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = resolveChapterNumber(chapters, chapterNumber);
    setInvalidNumber(!target);
    if (target) onReadChapter(target.href);
  }

  function showCurrent() {
    if (currentNumber < 1 || currentNumber > chapters.length) return;
    setSearch('');
    setPage(Math.floor((currentNumber - 1) / CHAPTERS_PER_PAGE));
    // Keeping the chapter list on the page preserves the saved location.
  }

  return <section ref={sectionRef} className="details-card chapter-browser" aria-labelledby="detail-chapters-heading">
    <div className="details-section-header">
      <div><span className="details-label">PICK UP ANYWHERE</span><h2 id="detail-chapters-heading">Chapters</h2></div>
      <List size={21} className="details-section-icon" aria-hidden="true" />
    </div>
    <p className="details-help chapter-intro">Choose any chapter to begin reading there. Your new reading position is saved automatically.</p>
    {!isCachedOffline ? <div className="chapter-on-demand">
        <p className="details-help">Chapter titles are available after downloading the EPUB. Opening details does not download the novel.</p>
        <button type="button" className="primary-button" disabled={preparing} onClick={() => void prepareChapters()}>
          {preparing ? 'Preparing EPUB…' : 'Load chapter list'}
        </button>
        {error && <p className="chapter-error" role="alert">{error}</p>}
      </div>
      : !nearViewport ? <div className="chapter-loading">Chapter titles will load when you reach this section.</div>
      : loading ? <div className="chapter-loading" role="status">Loading chapter titles from your EPUB…</div>
      : error ? <p className="chapter-error" role="alert">{error}</p>
        : <>
          <div className="chapter-topline">
            <strong>{chapters.length.toLocaleString()} chapters available</strong>
            {currentNumber >= 1 && currentNumber <= chapters.length && <button type="button" className="chapter-current-link" onClick={showCurrent}><BookMarked size={15} /> Show my last chapter ({currentNumber})</button>}
          </div>
          <div className="chapter-tools">
            <label className="chapter-search"><Search size={18} aria-hidden="true" />
              <span className="sr-only">Search chapters</span>
              <input type="search" placeholder="Search chapter titles or numbers" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} />
            </label>
            <form className="chapter-jump" onSubmit={goToNumber}>
              <label htmlFor="chapter-number-jump">Go to</label>
              <input id="chapter-number-jump" type="number" min={1} max={chapters.length} placeholder="#" value={chapterNumber} onChange={(event) => { setChapterNumber(event.target.value); setInvalidNumber(false); }} aria-invalid={invalidNumber} />
              <button type="submit" disabled={!chapterNumber.trim()}>Open <ArrowRight size={15}/></button>
            </form>
          </div>
          {invalidNumber && <p className="chapter-validation" role="alert">Enter a chapter number between 1 and {chapters.length.toLocaleString()}.</p>}
          <div className="chapter-list" role="list" aria-label="Available chapters">
            {shown.map((item) => <div role="listitem" key={`${item.number}:${item.href}`}>
              <button type="button" className={`chapter-list-item ${item.number === currentNumber ? 'chapter-list-current' : ''}`} onClick={() => onReadChapter(item.href)} title={`Read chapter ${item.number}: ${item.label}`}>
                <span className="chapter-list-index">{item.number}</span>
                <span className="chapter-list-label">{item.label}</span>
                {item.number === currentNumber && <span className="chapter-list-badge">Last read</span>}
                <ArrowRight size={16} className="chapter-list-arrow" aria-hidden="true" />
              </button>
            </div>)}
            {!filtered.length && <div className="chapter-no-results">No chapters match your search.</div>}
          </div>
          {filtered.length > CHAPTERS_PER_PAGE && <nav className="chapter-paging" aria-label="Chapter list pages">
            <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft size={16} /> Previous</button>
            <span>Showing {(page * CHAPTERS_PER_PAGE + 1).toLocaleString()}–{Math.min(filtered.length, (page + 1) * CHAPTERS_PER_PAGE).toLocaleString()} of {filtered.length.toLocaleString()}</span>
            <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next <ChevronRight size={16} /></button>
          </nav>}
        </>}
  </section>;
}
