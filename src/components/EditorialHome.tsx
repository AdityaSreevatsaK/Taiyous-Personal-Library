import { useMemo, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Bookmark, Feather, Sparkles } from 'lucide-react';
import { bookTags, tagCounts } from '../lib/tags';
import type { LibraryBook } from '../types';
import './editorial-home.css';

interface Props {
  books: LibraryBook[];
  onOpen: (book: LibraryBook) => void;
  onRead: (book: LibraryBook) => void;
  onBrowseTag: (tag: string) => void;
  cover: (book: LibraryBook, featured?: boolean) => ReactNode;
}

function readingStatus(book: LibraryBook): string {
  if (book.shelfStatus === 'trying') return 'Trying out';
  if (book.progress >= 99.5) return 'Finished';
  if (book.progress > 0) return 'Reading';
  return 'To be read';
}

/**
 * Grand Library's cover-led cinematic introduction, paired with the Literary
 * Journal's editorial index. All actions use the REAL library callbacks:
 * no fictional fixtures, separate catalogue, or replacement of owner controls.
 */
export default function EditorialHome({ books, onOpen, onRead, onBrowseTag, cover }: Props) {
  const reading = useMemo(
    () => books.filter(book => book.shelfStatus !== 'trying' && book.progress > 0 && book.progress < 99.5)
      .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0)),
    [books],
  );
  const featured = reading[0] ?? books.find(book => book.shelfStatus !== 'trying') ?? books[0];
  const displayBooks = useMemo(() => {
    if (!featured) return [];
    return [featured, ...books.filter(book => book.id !== featured.id).slice(0, 2)];
  }, [books, featured]);
  const index = useMemo(() => [...books]
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }))
    .slice(0, 10), [books]);
  const commonTags = useMemo(() => tagCounts(books).slice(0, 7), [books]);
  const trialCount = books.filter(book => book.shelfStatus === 'trying').length;
  if (!featured) return null;

  return <div className="editorial-home" aria-label="Your library front page">
    <section className="editorial-grand" aria-labelledby="editorial-grand-heading">
      <div className="editorial-grand-inner">
        <div className="editorial-grand-copy">
          <p className="editorial-kicker"><Sparkles size={14} /> TAIYOU'S PRIVATE LIBRARY <span>·</span> THE READER'S EDITION</p>
          <h1 id="editorial-grand-heading">Where worlds <em>unfold.</em></h1>
          <p className="editorial-grand-tagline">A home for extraordinary stories and all the places they take you.</p>
          <div className="editorial-featured-book">
            <span className="editorial-eyebrow">YOUR NEXT CHAPTER</span>
            <h2>{featured.title}</h2>
            <p className="editorial-featured-author">by {featured.author}</p>
            <p className="editorial-featured-synopsis">{featured.userDescription || featured.description || 'Your next reading journey is ready when you are.'}</p>
            {featured.progress > 0 && <div className="editorial-featured-progress" aria-label={Math.round(featured.progress) + '% read'}>
              <span style={{ width: Math.max(0, Math.min(100, featured.progress)) + '%' }} />
            </div>}
          </div>
          <div className="editorial-grand-actions">
            <button type="button" className="editorial-primary" onClick={() => onRead(featured)}>
              <BookOpen size={18} /> {featured.progress > 0 ? 'Continue reading' : 'Begin reading'} <ArrowRight size={16} />
            </button>
            <button type="button" className="editorial-secondary" onClick={() => onOpen(featured)}>
              Explore this novel <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="editorial-grand-gallery" aria-label="Featured books">
          <div className="editorial-art-halo" aria-hidden="true" />
          {displayBooks.map((book, index) => <button
            className={'editorial-art-book editorial-art-book-' + index}
            type="button" key={book.id}
            aria-label={'View details for ' + book.title}
            onClick={() => onOpen(book)}
          >{cover(book, true)}</button>)}
          <span className="editorial-art-caption">{books.length} WORLDS · YOUR COLLECTION</span>
        </div>
      </div>
      <div className="editorial-grand-ledger" aria-label="Your library at a glance">
        <span><b>{books.length}</b> novels on your shelves</span>
        <span><b>{reading.length}</b> journeys in progress</span>
        <span><b>{trialCount}</b> under consideration</span>
      </div>
    </section>

    {reading.length > 0 && <section className="editorial-continue" aria-label="Continue reading shelf">
      <div className="editorial-section-heading">
        <div><span className="editorial-eyebrow">01 / THE READING DESK</span><h2>Continue your journey</h2></div>
        <span className="editorial-section-aside">{reading.length} {reading.length === 1 ? 'story' : 'stories'} in progress</span>
      </div>
      <div className="editorial-continue-rail">
        {reading.slice(0, 6).map(book => <article className="editorial-continue-card" key={book.id}>
          <button type="button" className="editorial-continue-cover" aria-label={'View details for ' + book.title} onClick={() => onOpen(book)}>{cover(book)}</button>
          <div className="editorial-continue-copy">
            <p className="editorial-eyebrow">CURRENTLY READING</p>
            <button type="button" className="editorial-book-title" onClick={() => onOpen(book)}>{book.title}</button>
            <span>{book.currentChapter || book.author}</span>
            <div className="editorial-rail-progress" aria-label={Math.round(book.progress) + '% complete'}><i style={{ width: book.progress + '%' }} /></div>
            <button type="button" className="editorial-rail-read" onClick={() => onRead(book)}>
              Resume · {Math.round(book.progress)}% <ArrowRight size={13}/>
            </button>
          </div>
        </article>)}
      </div>
    </section>}

    <section className="editorial-journal" aria-label="The literary journal">
      <div className="editorial-journal-rule"><span>THE PERSONAL EDITION</span><span>COLLECTION NOTES &amp; INDEX</span><span>✦</span></div>
      <header className="editorial-journal-masthead">
        <Feather size={23} aria-hidden="true"/>
        <div><span>THE READER'S</span><h2>Literary Journal</h2><p>A library of stories, arranged for one.</p></div>
        <Feather size={23} aria-hidden="true"/>
      </header>
      <div className="editorial-journal-columns">
        <div className="editorial-journal-index">
          <div className="editorial-section-heading">
            <div><span className="editorial-eyebrow">02 / THE INDEX</span><h3>An index of worlds</h3></div>
            <a href="#library-full-catalogue">Full catalogue <ArrowRight size={14}/></a>
          </div>
          <div className="editorial-index-labels" aria-hidden="true"><span>NO.</span><span>NOVEL</span><span>GENRE</span><span>YOUR SHELF</span></div>
          <div className="editorial-index-rows">
            {index.map((book, i) => <button type="button" key={book.id}
              className="editorial-index-row" onClick={() => onOpen(book)}
              aria-label={'View details for ' + book.title}>
              <span className="editorial-index-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="editorial-index-name"><strong>{book.title}</strong><small>{book.author}</small></span>
              <span className="editorial-index-genre">{bookTags(book)[0] || 'Novel'}</span>
              <span className="editorial-index-state">{readingStatus(book)}</span>
            </button>)}
          </div>
          {books.length > index.length && <a className="editorial-index-more" href="#library-full-catalogue">Explore all {books.length} novels <ArrowRight size={15}/></a>}
        </div>
        <aside className="editorial-margin" aria-label="Notes from your reading room">
          <div className="editorial-margin-rule"><span>IN THE MARGINS</span><span>✦</span></div>
          <section className="editorial-margin-note">
            <span className="editorial-eyebrow">A NOTE FROM YOUR LIBRARY</span>
            <h3>Keep the story close.</h3>
            <p>Make room for a different world. Your chapters, notes and reading history remain where you left them.</p>
          </section>
          <section className="editorial-margin-stats">
            <span className="editorial-eyebrow">YOUR READING RECORD</span>
            <div><strong>{books.length}</strong><span>STORIES</span></div>
            <div><strong>{reading.length}</strong><span>IN PROGRESS</span></div>
            <div><strong>{trialCount}</strong><span>TRYING OUT</span></div>
          </section>
          {commonTags.length > 0 && <section className="editorial-margin-topics">
            <span className="editorial-eyebrow">EXPLORE THE SHELVES</span>
            <div>{commonTags.map(({tag, count}) => <button type="button" key={tag}
              onClick={() => onBrowseTag(tag)} aria-label={'Browse novels tagged ' + tag}>
              <Bookmark size={12}/> {tag} <small>{count}</small>
            </button>)}</div>
          </section>}
        </aside>
      </div>
    </section>
  </div>;
}
