import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, BookMarked, ChevronLeft, ChevronRight, List, Search } from 'lucide-react';
import { CHAPTERS_PER_PAGE, resolveChapterNumber, searchChapterCatalog } from '../lib/catalog';
import type { ChapterItem, LibraryBook } from '../types';

interface Props {
  book: LibraryBook;
  onReadChapter: (href: string) => void;
  isCachedOffline: boolean;
  onLoadChapters: () => Promise<ChapterItem[]>;
}

/** Chapter selection on the novel's details page (before entering the reader). */
export default function ChapterBrowser({ book, onReadChapter, isCachedOffline, onLoadChapters }: Props) {
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [chapterNumber, setChapterNumber] = useState('');
  const [page, setPage] = useState(0);
  const [invalidNumber, setInvalidNumber] = useState(false);
  // The callback is recreated by the parent as state changes. Keep the latest
  // version without triggering duplicate downloads on every parent render.
  const loadRef = useRef(onLoadChapters);
  loadRef.current = onLoadChapters;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setPreparing(true);
    setError(null);
    setChapters([]);
    setPage(0);
    void loadRef.current().then(list => {
      if (!active) return;
      setChapters(list);
      if (!list.length) setError('This EPUB contains no readable chapter entries.');
    }).catch((reason: unknown) => {
      if (active) setError(`Unable to prepare chapters: ${reason instanceof Error ? reason.message : String(reason)}`);
    }).finally(() => {
      if (active) { setLoading(false); setPreparing(false); }
    });
    return () => { active = false; };
  }, [book.id, book.chapterCount]);

  async function prepareChapters() {
    if (preparing) return;
    setPreparing(true);
    setLoading(true);
    setError(null);
    try {
      const list = await loadRef.current();
      setChapters(list);
      if (!list.length) setError('This EPUB contains no readable chapter entries.');
    } catch (reason) {
      setError(`Unable to prepare chapters: ${reason instanceof Error ? reason.message : String(reason)}`);
    } finally {
      setLoading(false);
      setPreparing(false);
    }
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
    {loading ? <div className="chapter-loading" role="status">Preparing chapter list in the background…</div>
      : error ? <div className="chapter-on-demand" role="alert">
          <p className="chapter-error">{error}</p>
          <button type="button" className="primary-button" disabled={preparing}
            onClick={() => void prepareChapters()}>Retry loading chapters</button>
        </div>
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
            <div className="chapter-page-actions">
              <button type="button" disabled={page === 0} onClick={() => setPage(0)}>First</button>
              <button type="button" disabled={page === 0} onClick={() => setPage(p => Math.max(0, p - 1))}><ChevronLeft size={16} /> Previous</button>
            </div>
            <span>Showing {(page * CHAPTERS_PER_PAGE + 1).toLocaleString()}–{Math.min(filtered.length, (page + 1) * CHAPTERS_PER_PAGE).toLocaleString()} of {filtered.length.toLocaleString()}</span>
            <div className="chapter-page-actions">
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>Next <ChevronRight size={16} /></button>
              <button type="button" disabled={page >= pageCount - 1} onClick={() => setPage(pageCount - 1)}>Last page <ChevronRight size={16}/></button>
            </div>
          </nav>}
        </>}
  </section>;
}
