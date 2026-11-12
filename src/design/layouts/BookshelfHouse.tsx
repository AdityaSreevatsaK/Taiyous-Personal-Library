
import { useState } from 'react';
import {
  BookCover, FilterStrip, LabSearch, LayoutDetail,
  filterBooks, type ConceptProps, type LabBook, type LabFilter,
} from './core';
import './shelves.css';

const rows: { id:LabFilter; title:string; subtitle:string; emblem:string }[] = [
  {id:'reading',title:'Journeys in progress',subtitle:'Pick up where you left off',emblem:'◉'},
  {id:'trying',title:'The tasting shelf',subtitle:'Stories waiting for their chance',emblem:'✧'},
  {id:'unread',title:'Untouched worlds',subtitle:'Your next beginning',emblem:'◇'},
];
export default function BookshelfHouse({books,active,select,read}:ConceptProps){
  const [filter,setFilter]=useState<LabFilter>('all');
  const [query,setQuery]=useState('');
  const groups=rows.map(row=>({...row,books:filterBooks(books,row.id,query)}))
    .filter(row=>row.books.length && (filter==='all'||filter===row.id));
  return <div className="shelves-shell">
    <header className="shelves-entrance">
      <div className="shelves-entrance-decor" aria-hidden="true">✶</div>
      <span className="lab-kicker">THE PERSONAL COLLECTION</span>
      <h1>Welcome to the <em>book room.</em></h1>
      <p>Every story has its own place on the shelf. Choose a world, open its pages and make yourself comfortable.</p>
      <div className="shelves-top-actions">
        <LabSearch value={query} change={setQuery} placeholder="Find a book in the room…"/>
        <FilterStrip selected={filter} change={setFilter}/>
      </div>
      <div className="shelves-entrance-stat" aria-label={books.length+' sample books'}>
        <b>{books.length}</b><small>WORLDS TO EXPLORE</small>
      </div>
    </header>
    <main className="shelves-room">
      <div className="shelves-room-overline"><span>THE WEST WING</span><span>FICTIONAL SAMPLE COLLECTION · {books.length} VOLUMES</span></div>
      {groups.map(row=><section className="shelves-unit" key={row.id} aria-label={row.title}>
        <div className="shelves-row-heading">
          <span className="shelves-emblem" aria-hidden>{row.emblem}</span>
          <div><span className="lab-kicker">{row.subtitle}</span><h2>{row.title}</h2></div>
          <span className="shelves-count">{row.books.length} VOLUMES</span>
        </div>
        <div className="shelves-board">
          <div className="shelves-volume-rail">
            {row.books.map((book,i)=><button type="button" key={book.id}
              className={'shelves-standing shelves-standing-'+(i%3)}
              onClick={()=>select(book)} aria-label={'Take down '+book.title}>
              <BookCover book={book} />
              <span className="shelves-volume-label">{book.title}</span>
              {book.progress>0&&<span className="shelves-book-progress">{book.progress}%</span>}
            </button>)}
          </div>
          <div className="shelves-wood-plank" aria-hidden="true"/>
        </div>
      </section>)}
      {!groups.length&&<p className="lab-empty">There are no books on this shelf. Try another filter.</p>}
      <footer className="shelves-room-footer">✧ &nbsp; KEEP THE STORIES YOU LOVE, AND LET THE REST SURPRISE YOU &nbsp; ✧</footer>
    </main>
    {active&&<div className="shelves-dialog-backdrop" role="presentation">
      <div className="shelves-book-open" role="dialog" aria-modal="true" aria-label={'Selected book: '+active.title}>
        <div className="shelves-open-binding" aria-hidden="true"/>
        <LayoutDetail book={active} select={select} read={read} styleName="shelves-detail"/>
      </div>
    </div>}
  </div>;
}
