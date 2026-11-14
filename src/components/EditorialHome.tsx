import { useMemo, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Bookmark, Feather, Sparkles } from 'lucide-react';
import { bookTags, tagCounts } from '../lib/tags';
import type { BookCollection } from '../lib/collections';
import { selectHomeBooks, selectHomeShelves } from '../lib/home-curation';
import type { LibraryBook } from '../types';
import './editorial-home.css';

interface Props {
  books: LibraryBook[];
  collections: BookCollection[];
  onBrowseCollection: (id: string) => void;
  onBrowseAll: () => void;
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
export default function EditorialHome({
  books, collections, onBrowseCollection, onBrowseAll, onOpen, onRead, onBrowseTag, cover,
}: Props) {
  const { featured, continueReading, journal } = useMemo(() => selectHomeBooks(books), [books]);
  const readingCount = useMemo(() =>
    books.filter(book => book.shelfStatus !== 'trying' && book.progress > 0 && book.progress < 99.5).length, [books]);
  const displayBooks = useMemo(() =>
    featured ? [featured, ...journal.filter(book => book.id !== featured.id).slice(0, 2)] : [],
    [featured, journal]);
  const shelves = useMemo(() => selectHomeShelves(books, collections, 4), [books, collections]);
  const commonTags = useMemo(() => tagCounts(books).slice(0, 5), [books]);
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
            aria-label={'Featured cover for ' + book.title}
            onClick={() => onOpen(book)}
          >{cover(book, true)}</button>)}
          <span className="editorial-art-caption">{books.length} WORLDS · YOUR COLLECTION</span>
        </div>
      </div>
      <div className="editorial-grand-ledger" aria-label="Your library at a glance">
        <span><b>{books.length}</b> novels on your shelves</span>
        <span><b>{readingCount}</b> journeys in progress</span>
        <span><b>{trialCount}</b> under consideration</span>
      </div>
    </section>

    {continueReading.length > 0 && <section className="editorial-continue" aria-label="Continue reading shelf">
      <div className="editorial-section-heading">
        <div><span className="editorial-eyebrow">01 / THE READING DESK</span><h2>Continue your journey</h2></div>
        <span className="editorial-section-aside">Other novels in progress</span>
      </div>
      <div className="editorial-continue-rail">
        {continueReading.map(book => <article className="editorial-continue-card" key={book.id}>
          <button type="button" className="editorial-continue-cover" aria-label={'Reading desk cover for ' + book.title} onClick={() => onOpen(book)}>{cover(book)}</button>
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
            <div><span className="editorial-eyebrow">02 / CURATED FOR YOU</span><h3>From your shelves</h3></div>
            <button type="button" className="editorial-text-link" onClick={onBrowseAll}>Full catalogue <ArrowRight size={14}/></button>
          </div>
          <div className="editorial-index-labels" aria-hidden="true"><span>NO.</span><span>NOVEL</span><span>GENRE</span><span>YOUR SHELF</span></div>
          <div className="editorial-index-rows">
            {journal.map((book, i) => <button type="button" key={book.id}
              className="editorial-index-row" onClick={() => onOpen(book)}
              aria-label={'Journal entry for ' + book.title}>
              <span className="editorial-index-number">{String(i + 1).padStart(2, '0')}</span>
              <span className="editorial-index-name"><strong>{book.title}</strong><small>{book.author}</small></span>
              <span className="editorial-index-genre">{bookTags(book)[0] || 'Novel'}</span>
              <span className="editorial-index-state">{readingStatus(book)}</span>
            </button>)}
          </div>
          {books.length > journal.length && <button type="button" className="editorial-index-more" onClick={onBrowseAll}>Explore all {books.length} novels <ArrowRight size={15}/></button>}
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
            <div><strong>{readingCount}</strong><span>IN PROGRESS</span></div>
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

    {shelves.length > 0 && <section className="editorial-shelves" aria-label="Explore collections and genres">
      <div className="editorial-section-heading">
        <div><span className="editorial-eyebrow">03 / YOUR BOOKSHELVES</span><h2>Explore your shelves</h2></div>
        <span className="editorial-section-aside">A few paths into your collection</span>
      </div>
      <div className="editorial-shelf-grid">
        {shelves.map(shelf => <button type="button" className="editorial-shelf-card"
          key={shelf.kind + ':' + shelf.id}
          onClick={() => shelf.kind === 'collection' ? onBrowseCollection(shelf.id) : onBrowseTag(shelf.id)}
          aria-label={`Browse ${shelf.kind} ${shelf.name}`}>
          <span className="editorial-shelf-cover" aria-hidden="true">{cover(shelf.preview)}</span>
          <span className="editorial-shelf-details">
            <span className="editorial-eyebrow">{shelf.kind === 'collection' ? 'COLLECTION' : 'GENRE & TAG'}</span>
            <strong>{shelf.name}</strong>
            <small>{shelf.count} {shelf.count === 1 ? 'novel' : 'novels'}</small>
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </button>)}
      </div>
    </section>}

    <section className="editorial-all-books" aria-label="Open complete novel catalogue">
      <div><span className="editorial-eyebrow">THE COMPLETE COLLECTION</span>
        <h2>Every world, one library.</h2>
        <p>Browse your entire collection with sorting, searching and filters whenever you wish.</p>
      </div>
      <button type="button" className="editorial-browse-all" onClick={onBrowseAll}>
        Browse all {books.length} {books.length === 1 ? 'novel' : 'novels'} <ArrowRight size={16}/>
      </button>
    </section>
  </div>;
}
