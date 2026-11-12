
import { useState } from 'react';
import {
  BookCover, LabSearch, ReadButton, ProgressLine, StatusPill,
  filterBooks, type ConceptProps, type LabFilter,
} from './core';
import './journal.css';

export default function LiteraryJournal({books, active, select, read}:ConceptProps){
  const [filter,setFilter]=useState<LabFilter>('all');
  const [query,setQuery]=useState('');
  const visible=filterBooks(books,filter,query);
  const featured=active??books[0];
  const recent=books.filter(b=>b.progress>0);
  return <div className="journal-shell">
    <div className="journal-topline">
      <span>THE PRIVATE EDITION</span><span>A JOURNAL OF FANTASTICAL WORLDS</span>
      <span>ISSUE NO. 001 · NOVEMBER</span>
    </div>
    <header className="journal-masthead">
      <div className="journal-mark">✦</div>
      <div><span className="journal-title-lead">THE READER'S</span>
        <h1>Literary Journal</h1>
        <p>TAIYOU'S PERSONAL LIBRARY · CURATED FOR ONE</p>
      </div>
      <div className="journal-mark">✦</div>
    </header>
    <nav className="journal-nav" aria-label="Literary Journal sections">
      {([
        ['all','ALL STORIES'],['reading','IN THE MARGINS'],['trying','UNDER CONSIDERATION'],['unread','UNOPENED']
      ] as [LabFilter,string][]).map(([id,label])=>
        <button key={id} type="button" onClick={()=>setFilter(id)}
          aria-pressed={filter===id} className={filter===id?'selected':''}>{label}</button>)}
    </nav>
    <main className="journal-main">
      <div className="journal-edit">
        <article className="journal-cover-story">
          <div className="journal-story-top">
            <span className="lab-kicker">THE FEATURED STORY</span>
            <span>READER'S SELECTION / {String(books.indexOf(featured)+1).padStart(2,'0')}</span>
          </div>
          <div className="journal-feature-content">
            <div className="journal-feature-copy">
              <p className="journal-dropcap">Every journey begins with a page.</p>
              <h2>{featured.title}</h2>
              <p className="journal-feature-byline">by {featured.author}</p>
              <div className="journal-feature-rule" />
              <p className="journal-lead">{featured.description}</p>
              <p className="journal-story-extra">
                Kept among your own books, this fictional tale represents the worlds you've chosen
                to explore. Your notes and chapters remain yours, with the reader only a click away.
              </p>
              <div className="journal-feature-info"><StatusPill book={featured}/>
                <span>{featured.chapters} CHAPTERS</span>
                {featured.rating&&<span>★ {featured.rating}/10</span>}</div>
              <ProgressLine book={featured} />
              <div className="journal-actions">
                <ReadButton book={featured} read={read}/>
                <a href={'/book/'+featured.id}>VIEW FULL DETAILS ↗</a>
              </div>
            </div>
            <div className="journal-feature-art">
              <BookCover book={featured}/>
              <div className="journal-art-caption">FICTIONAL COVER · PERSONAL EDITION</div>
            </div>
          </div>
        </article>
        <section className="journal-index" aria-label="Book index">
          <div className="journal-index-top"><div><span className="lab-kicker">THE CATALOGUE</span>
            <h2>An index of worlds</h2></div><LabSearch value={query} change={setQuery} placeholder="Search the index..." /></div>
          <div className="journal-index-head"><span>NO.</span><span>BOOK</span><span>GENRE</span><span>STATUS</span></div>
          <div className="journal-index-body">
            {visible.map((book,index)=><button type="button" className="journal-index-row" key={book.id}
              onClick={()=>{select(book);window.scrollTo({top:0,behavior:'smooth'});}}
              aria-label={'Feature '+book.title}>
              <span className="journal-index-number">{String(index+1).padStart(2,'0')}</span>
              <span className="journal-index-book"><strong>{book.title}</strong><small>{book.author}</small></span>
              <span className="journal-index-genre">{book.tags[0]}</span>
              <StatusPill book={book}/>
            </button>)}
            {!visible.length&&<p className="lab-empty">Nothing in this issue matches your query.</p>}
          </div>
        </section>
      </div>
      <aside className="journal-margin" aria-label="Reading notes and recommendations">
        <div className="journal-margin-heading"><span>THE MARGINS</span><span>✦</span></div>
        <section className="journal-column">
          <span className="lab-kicker">A NOTE FROM YOUR LIBRARY</span>
          <h2>Keep the story close.</h2>
          <p>There is no need to rush from one world to the next. Pick up a novel when the moment is right.</p>
        </section>
        <section className="journal-column journal-record">
          <span className="lab-kicker">READING RECORD</span>
          <div><b>{books.length}</b><span>STORIES</span></div>
          <div><b>{recent.length}</b><span>IN PROGRESS</span></div>
          <div><b>{books.filter(b=>b.trying).length}</b><span>TRYING OUT</span></div>
        </section>
        <section className="journal-column">
          <span className="lab-kicker">ON YOUR BEDSIDE TABLE</span>
          {recent.map(book=><button type="button" className="journal-mini-read" key={book.id}
            onClick={()=>select(book)}><BookCover book={book}/>
            <span><strong>{book.title}</strong><small>{book.progress}% complete</small></span></button>)}
        </section>
        <div className="journal-colophon"><span>✦</span><p>Read what you love.<br/>Save what matters.</p>
          <small>A DESIGN CONCEPT · SAMPLE DATA</small></div>
      </aside>
    </main>
    <footer className="journal-footer"><span>THE LITERARY JOURNAL</span>
      <span>ALL STORIES, NOTES AND DATA IN THIS GALLERY ARE FICTIONAL</span><span>✦ END OF ISSUE</span></footer>
  </div>;
}
