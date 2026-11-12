
import { useState } from 'react';
import {
  BookCover, LabSearch, ProgressLine, ReadButton, StatusPill,
  filterBooks, type ConceptProps, type LabFilter,
} from './core';
import './desk.css';

const sectionLinks: {id:LabFilter; label:string; symbol:string}[] = [
  {id:'all',label:'Entire library',symbol:'▦'},
  {id:'reading',label:'Reading now',symbol:'◷'},
  {id:'trying',label:'Trying out',symbol:'✧'},
  {id:'unread',label:'To be read',symbol:'◇'},
];

export default function ReadingDesk({books, active, select, read}: ConceptProps) {
  const [filter,setFilter] = useState<LabFilter>('all');
  const [search,setSearch] = useState('');
  const [sort,setSort] = useState<'title'|'progress'>('title');
  const visible = filterBooks(books,filter,search).sort((a,b)=>
    sort==='title' ? a.title.localeCompare(b.title) : b.progress-a.progress);
  const selected = active && visible.some(item=>item.id===active.id)?active:visible[0]??null;
  return <div className="desk-shell">
    <header className="desk-topbar">
      <div className="desk-topbar-mark"><span>⌘</span> TAIYOU / THE READING DESK</div>
      <div className="desk-topbar-note">A workspace for your private worlds</div>
      <div className="desk-topbar-status"><span className="desk-status-dot"/> LOCAL CONCEPT</div>
    </header>
    <main className="desk-workspace">
      <aside className="desk-navigation">
        <div className="desk-nav-head">
          <span className="lab-kicker">SECTIONS</span>
          <p>Move between shelves without leaving your reading desk.</p>
        </div>
        <nav aria-label="Reading Desk shelves">
          {sectionLinks.map(item=><button type="button" key={item.id}
            className={filter===item.id?'active':''} aria-pressed={filter===item.id}
            onClick={()=>{setFilter(item.id);select(null);}}>
            <span className="desk-nav-symbol">{item.symbol}</span>{item.label}
            <small>{filterBooks(books,item.id).length}</small>
          </button>)}
        </nav>
        <div className="desk-nav-divider"/>
        <span className="lab-kicker">QUICK TAGS</span>
        <div className="desk-nav-tags">
          {['Cultivation','Romance','Progression','Xianxia'].map(tag=><button type="button"
            key={tag} onClick={()=>{setFilter('all');setSearch(tag);select(null);}}>#{tag}</button>)}
        </div>
        <p className="desk-sidebar-foot">A distraction-free catalogue with everything in reach.</p>
      </aside>
      <section className="desk-list-pane" aria-label="Novel list">
        <div className="desk-list-heading">
          <span className="lab-kicker">YOUR INVENTORY</span>
          <h1>Find your next<br/><em>chapter.</em></h1>
          <p>{visible.length} fictional titles · Select a book to inspect it</p>
          <LabSearch value={search} change={setSearch}/>
        </div>
        <div className="desk-list-controls">
          <span>BOOKS <b>{visible.length}</b></span>
          <button type="button" onClick={()=>setSort(sort==='title'?'progress':'title')}>
            Sort: {sort==='title'?'A–Z':'Progress'} ↕
          </button>
        </div>
        <div className="desk-book-list">
          {visible.map(book=><button type="button" key={book.id}
            className={'desk-row '+(selected?.id===book.id?'selected':'')}
            onClick={()=>select(book)} aria-pressed={selected?.id===book.id}
            aria-label={'Inspect '+book.title}>
            <BookCover book={book} />
            <span className="desk-row-text"><strong>{book.title}</strong>
              <small>{book.author}</small><StatusPill book={book}/></span>
            <span className="desk-row-arrow" aria-hidden>↗</span>
          </button>)}
          {!visible.length&&<p className="lab-empty">No novels match your current search.</p>}
        </div>
      </section>
      <section className="desk-detail-pane" aria-label="Selected novel details">
        {selected ? <div className="desk-inspector">
          <div className="desk-inspector-top">
            <span className="lab-kicker">BOOK PROFILE / {String(visible.indexOf(selected)+1).padStart(2,'0')}</span>
            <span className="desk-chapter-count">{selected.chapters} SAMPLE CHAPTERS</span>
          </div>
          <div className="desk-inspector-cover">
            <div className="desk-inspector-art"><BookCover book={selected}/></div>
            <span className="desk-asset-caption">SELECTED FROM YOUR COLLECTION</span>
          </div>
          <div className="desk-inspector-info">
            <h2>{selected.title}</h2><p className="desk-author">by {selected.author}</p>
            <div className="desk-info-line">
              <StatusPill book={selected}/>
              {selected.rating&&<span>★ {selected.rating}/10</span>}
              <span>EN</span>
            </div>
            <ProgressLine book={selected}/>
            <p className="desk-description">{selected.description}</p>
            <div className="desk-info-tags">{selected.tags.map(tag=><span key={tag}>{tag}</span>)}</div>
            <div className="desk-buttons">
              <ReadButton book={selected} read={read}/>
              <a href={'/book/'+selected.id} className="desk-text-link">Full novel details ↗</a>
            </div>
          </div>
          <div className="desk-notes"><span className="lab-kicker">YOUR READING RECORD</span>
            <p>{selected.progress ? 'You have completed '+selected.progress+'% of this story. Continue at the next chapter.' :
              selected.trying ? 'On your Trying out shelf. Explore a chapter before deciding.' :
              'New to your collection. The first chapter is ready.'}</p>
            <p className="desk-fineprint">This visual concept uses sample data only. The real app preserves all your saved ratings and notes.</p>
          </div>
        </div> : <div className="desk-empty"><h2>No matching book</h2><p>Choose another shelf or clear your search.</p></div>}
      </section>
    </main>
  </div>;
}
