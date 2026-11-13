import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, Download, Library, Sparkles } from 'lucide-react';
import type { LibraryBook } from '../types';

interface Props {
  books: LibraryBook[];
  reading: LibraryBook[];
  offlineCount: number;
  cover: (book: LibraryBook, featured?: boolean) => ReactNode;
  onOpen: (book: LibraryBook) => void;
  onRead: (book: LibraryBook) => void;
  onLibrary: () => void;
  onTrying: () => void;
  onOffline: () => void;
  onImport: () => void;
}

/**
 * Dedicated landing page. No copy of the Grand Library hero is rendered on
 * My Library, Collections, Trying Out or Offline. All book actions use App's
 * existing callbacks and preserve cloud/offline/owner behaviour.
 */
export default function LibraryHome({
  books, reading, offlineCount, cover,
  onOpen, onRead, onLibrary, onTrying, onOffline, onImport,
}: Props) {
  const recent = [...reading].sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0));
  const featured = recent[0] ?? books[0];
  const featureBooks = [featured, ...books.filter(book => book.id !== featured?.id)].filter(
    (book): book is LibraryBook => Boolean(book),
  ).slice(0, 3);
  const trialCount = books.filter(book => book.shelfStatus === 'trying').length;

  return <div className="hybrid-home">
    <section className="hybrid-home-hero" aria-label="Welcome to Taiyou's library">
      <div className="hybrid-home-copy">
        <span className="hybrid-home-kicker">TAIYOU'S PERSONAL LIBRARY · HOME</span>
        <h1>Where worlds <em>unfold.</em></h1>
        <p className="hybrid-home-lede">
          A quiet place for the stories worth keeping.
        </p>
        {featured ? <>
          <div className="hybrid-home-feature">
            <span>{featured.progress > 0 ? 'YOUR CURRENT CHAPTER' : 'A STORY TO BEGIN'}</span>
            <button type="button" onClick={() => onOpen(featured)}>{featured.title}</button>
            <small>{featured.progress > 0
              ? `${Math.round(featured.progress)}% read${featured.currentChapter ? ' · ' + featured.currentChapter : ''}`
              : featured.author}</small>
          </div>
          <div className="hybrid-home-actions">
            <button type="button" className="hybrid-home-primary" onClick={() => onRead(featured)}>
              <BookOpen size={16}/> {featured.progress > 0 ? 'Continue reading' : 'Start reading'} <ArrowRight size={16}/>
            </button>
            <button type="button" className="hybrid-home-secondary" onClick={onLibrary}>
              Browse the library <ArrowRight size={15}/>
            </button>
          </div>
        </> : <>
          <p className="hybrid-home-empty">Your library is ready for its first novel.</p>
          <div className="hybrid-home-actions">
            <button type="button" className="hybrid-home-primary" onClick={onImport}>Add your first novel <ArrowRight size={16}/></button>
          </div>
        </>}
      </div>
      <div className="hybrid-home-art" aria-label="Featured books">
        <div className="hybrid-home-halo" aria-hidden="true"/>
        {featureBooks.map((book, index) =>
          <button type="button" key={book.id} className={`hybrid-home-art-book book-${index}`}
            aria-label={`View details for ${book.title}`} onClick={() => onOpen(book)}>
            {cover(book, true)}
          </button>)}
        {featureBooks.length === 0 && <div className="hybrid-home-empty-art" aria-hidden="true">✧</div>}
      </div>
    </section>

    <section className="hybrid-home-shortcuts" aria-label="Library shortcuts">
      <button type="button" onClick={onLibrary}>
        <Library size={20}/><span><strong>My Library</strong><small>{books.length} novels</small></span><ArrowRight size={16}/>
      </button>
      <button type="button" onClick={onTrying}>
        <Sparkles size={20}/><span><strong>Trying out</strong><small>{trialCount} to explore</small></span><ArrowRight size={16}/>
      </button>
      <button type="button" onClick={onOffline}>
        <Download size={20}/><span><strong>Offline</strong><small>{offlineCount} available here</small></span><ArrowRight size={16}/>
      </button>
    </section>

    <section className="hybrid-home-reading" aria-label="Your reading shelf">
      <div className="hybrid-home-section-head">
        <div><span>THE READER'S DESK</span><h2>Continue reading</h2></div>
        <button type="button" onClick={onLibrary}>View library <ArrowRight size={15}/></button>
      </div>
      {recent.length > 0 ? <div className="hybrid-home-reading-grid">
        {recent.slice(0, 4).map(book =>
          <article className="hybrid-home-reading-card" key={book.id}>
            <button type="button" className="hybrid-home-reading-cover" onClick={() => onOpen(book)}
              aria-label={`View details for ${book.title}`}>{cover(book)}</button>
            <div className="hybrid-home-reading-meta">
              <button type="button" className="hybrid-home-reading-title" onClick={() => onOpen(book)}>{book.title}</button>
              <span>{book.author}</span>
              <div className="hybrid-home-reading-progress" aria-label={`${Math.round(book.progress)}% read`}>
                <i style={{ width: `${Math.min(100, Math.max(0, book.progress))}%` }}/>
              </div>
              <small>{Math.round(book.progress)}% completed</small>
              <button className="hybrid-home-reading-open" type="button" onClick={() => onRead(book)}>Read <ArrowRight size={14}/></button>
            </div>
          </article>)}
      </div> : <div className="hybrid-home-no-reading">
        <p>Your reading shelf is empty. Browse the collection to begin a new story.</p>
        <button type="button" onClick={onLibrary}>Browse novels <ArrowRight size={15}/></button>
      </div>}
    </section>
    <footer className="hybrid-home-footer">
      <span>THE PERSONAL EDITION</span><span>YOUR STORIES, YOUR PACE</span>
    </footer>
  </div>;
}
