
import { useState } from 'react';
import {
  BookCover, FilterStrip, LabSearch, LayoutDetail, ProgressLine, ReadButton,
  StatusPill, filterBooks, type ConceptProps, type LabFilter,
} from './core';
import './grand.css';

export default function GrandLibrary({books, active, select, read}: ConceptProps) {
  const [filter, setFilter] = useState<LabFilter>('all');
  const [search, setSearch] = useState('');
  const visible = filterBooks(books, filter, search);
  const featured = visible.find(book => book.progress > 0) ?? visible[0] ?? books[0];
  const inProgress = visible.filter(book => book.progress > 0);
  return <div className="grand-shell">
    <header className="grand-head">
      <a href="/layouts#grand" className="grand-wordmark">T<span>☼</span> TAIYOU<span className="grand-wordmark-sub">PRIVATE LIBRARY</span></a>
      <nav aria-label="Grand Library sections">
        <button type="button" onClick={() => {setFilter('all'); setSearch('');}}>Discover</button>
        <button type="button" onClick={() => setFilter('reading')}>My reading</button>
        <button type="button" onClick={() => setFilter('trying')}>Trying out</button>
      </nav>
      <LabSearch value={search} change={setSearch} placeholder="Search the collection" />
    </header>
    <main>
      <section className="grand-banner" aria-label="Continue your reading journey">
        <div className="grand-banner-light" aria-hidden="true">✧</div>
        <div className="grand-banner-copy">
          <span className="lab-kicker">01 / YOUR NEXT CHAPTER</span>
          <p className="grand-banner-intro">A place for extraordinary stories.</p>
          <h1>Where worlds<br/><em>unfold.</em></h1>
          <p className="grand-banner-description">{featured.description}</p>
          <div className="grand-banner-cta">
            <ReadButton book={featured} read={read} label={featured.progress ? 'Pick up where you left off' : 'Start your journey'} />
            <button className="grand-text-action" type="button" onClick={() => select(featured)}>Explore this novel ↗</button>
          </div>
        </div>
        <div className="grand-art">
          <div className="grand-art-halo" aria-hidden="true" />
          {books.slice(0,3).map((book,index) => <button key={book.id}
            type="button" className={'grand-art-book grand-art-book-' + index}
            aria-label={'Explore ' + book.title} onClick={() => select(book)}>
            <BookCover book={book} />
          </button>)}
          <span className="grand-art-caption">EIGHT WORLDS · ONE PERSONAL LIBRARY</span>
        </div>
      </section>
      <div className="grand-content">
        <div className="grand-discovery-bar">
          <div><span className="lab-kicker">THE COLLECTION</span><h2>Stories worth getting lost in</h2></div>
          <FilterStrip selected={filter} change={setFilter}/>
        </div>
        {inProgress.length>0 && <section className="grand-current" aria-label="Continue reading shelf">
          <div className="grand-section-head">
            <div><span className="lab-kicker">IN MOTION</span><h3>Continue reading</h3></div>
            <span>{inProgress.length} journeys in progress</span>
          </div>
          <div className="grand-current-rail">
            {inProgress.map(book => <button className="grand-current-card" type="button" key={book.id}
              onClick={() => select(book)} aria-label={'Details for ' + book.title}>
              <BookCover book={book}/>
              <div><strong>{book.title}</strong><span>{book.author}</span>
                <ProgressLine book={book}/><small>{book.progress}% complete · Open novel ↗</small></div>
            </button>)}
          </div>
        </section>}
        <section className="grand-library-section">
          <div className="grand-section-head"><div><span className="lab-kicker">THE FULL LIBRARY</span>
            <h3>{filter === 'trying' ? 'Novels on trial' : filter === 'reading' ? 'In progress' : 'Explore the collection'}</h3></div>
            <span>{visible.length} books</span></div>
          <div className="grand-book-grid">
            {visible.map(book => <button className="grand-book-tile" type="button" key={book.id}
              onClick={() => select(book)} aria-label={'Details for ' + book.title}>
              <BookCover book={book}/>
              <strong>{book.title}</strong><small>{book.author}</small>
              <StatusPill book={book}/>
            </button>)}
          </div>
          {!visible.length && <p className="lab-empty">No fictional novels matched that search.</p>}
        </section>
      </div>
    </main>
    {active && <div className="grand-detail-shade" role="presentation">
      <div className="grand-detail-dialog" role="dialog" aria-modal="true" aria-label={'Details for ' + active.title}>
        <LayoutDetail book={active} select={select} read={read} styleName="grand-detail" />
      </div>
    </div>}
  </div>;
}
