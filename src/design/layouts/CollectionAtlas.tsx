
import { useState } from 'react';
import {
  BookCover, LabSearch, LayoutDetail, ProgressLine, StatusPill,
  type ConceptProps,
} from './core';
import './atlas.css';

const regions=[
  {key:'all',name:'The whole atlas',symbol:'✺',blurb:'Every story',position:'core'},
  {key:'Cultivation',name:'Immortal Peaks',symbol:'山',blurb:'Cultivation',position:'north'},
  {key:'Progression',name:'Endless Ascent',symbol:'↑',blurb:'Progression',position:'east'},
  {key:'Romance',name:'Moonlit Garden',symbol:'月',blurb:'Romance',position:'south'},
  {key:'Fantasy',name:'Beyond the Veil',symbol:'✧',blurb:'Fantasy',position:'west'},
  {key:'Xianxia',name:'Jade Valley',symbol:'道',blurb:'Xianxia',position:'mid'},
] as const;
type RegionKey = typeof regions[number]['key'];

export default function CollectionAtlas({books, active, select, read}:ConceptProps) {
  const [region,setRegion]=useState<RegionKey>('all');
  const [search,setSearch]=useState('');
  const [sort,setSort]=useState<'title'|'progress'>('progress');
  const visible=books.filter(book=>
    (region==='all'||book.tags.includes(region)) &&
    (!search.trim()||[book.title,book.author,...book.tags].join(' ').toLowerCase().includes(search.toLowerCase())))
    .sort((a,b)=>sort==='progress'?b.progress-a.progress:a.title.localeCompare(b.title));
  const current=regions.find(item=>item.key===region)??regions[0];
  const reading=books.filter(book=>book.progress>0).sort((a,b)=>b.progress-a.progress);
  return <div className="atlas-shell">
    <aside className="atlas-side">
      <div className="atlas-logo">✺</div>
      <span>TAIYOU<br/>ATLAS</span>
      <div className="atlas-side-rule" />
      <button type="button" onClick={()=>{setRegion('all');setSearch('');}} aria-label="Show all books" title="The full atlas">⌂</button>
      <button type="button" onClick={()=>setRegion('Cultivation')} aria-label="Explore cultivation books" title="Immortal Peaks">山</button>
      <button type="button" onClick={()=>setRegion('Romance')} aria-label="Explore romance books" title="Moonlit Garden">月</button>
      <a href="/" title="Return to sample app" aria-label="Return to sample app">↩</a>
    </aside>
    <div className="atlas-content">
      <header className="atlas-masthead">
        <span className="lab-kicker">CURATED WORLDS / NO. 001</span>
        <span>AN EXPLORATION OF YOUR PERSONAL COLLECTION</span>
        <LabSearch value={search} change={setSearch} placeholder="Search the atlas..." />
      </header>
      <div className="atlas-top-grid">
        <main className="atlas-map-card">
          <div className="atlas-title-row">
            <div><span className="lab-kicker">THE MAP OF STORIES</span>
              <h1>Find your <em>next world.</em></h1>
              <p>Choose a realm. Follow a path. Discover the novels waiting there.</p></div>
            <span className="atlas-compass" aria-hidden>✦<small>N</small></span>
          </div>
          <div className="atlas-map" aria-label="Explore stories by genre">
            <svg className="atlas-route-lines" viewBox="0 0 900 520" preserveAspectRatio="none" aria-hidden="true">
              <path d="M145,218 C235,100 430,90 530,136 S770,140 810,270" fill="none" stroke="currentColor" strokeDasharray="6 7" strokeWidth="1.2"/>
              <path d="M145,218 Q350,400 500,290 T780,280" fill="none" stroke="currentColor" strokeDasharray="3 9" strokeWidth="1.2"/>
              <path d="M500,290 Q500,460 650,440" fill="none" stroke="currentColor" strokeWidth=".8" />
              <circle cx="145" cy="218" r="5" fill="currentColor"/>
              <circle cx="500" cy="290" r="5" fill="currentColor"/>
              <circle cx="780" cy="280" r="5" fill="currentColor"/>
            </svg>
            <div className="atlas-map-coordinates" aria-hidden>35° 18' N<br/>81° 06' E</div>
            {regions.map(item=>{
              const total=item.key==='all'?books.length:books.filter(book=>book.tags.includes(item.key)).length;
              return <button type="button" key={item.key}
                className={'atlas-region atlas-region-'+item.position+(region===item.key?' chosen':'')}
                onClick={()=>setRegion(item.key)} aria-pressed={region===item.key}
                aria-label={'Explore '+item.name+', '+total+' books'}>
                <span className="atlas-region-icon">{item.symbol}</span>
                <span className="atlas-region-label"><strong>{item.name}</strong><small>{total} books</small></span>
              </button>;
            })}
          </div>
          <div className="atlas-map-footer"><span>✧ CLICK ANY REGION TO TRAVEL</span>
            <span>MAP SCALE / PERSONAL LIBRARY</span></div>
        </main>
        <aside className="atlas-journey" aria-label="Your current reading trail">
          <span className="lab-kicker">THE READER'S TRAIL</span>
          <h2>Still travelling.</h2>
          <p>Every finished chapter takes you a little further.</p>
          <ol>
            {reading.map((book,index)=><li key={book.id}>
              <span className="atlas-stop-dot">{String(index+1).padStart(2,'0')}</span>
              <button type="button" onClick={()=>select(book)}>
                <strong>{book.title}</strong><span>{book.progress}% complete</span><ProgressLine book={book}/>
              </button>
            </li>)}
          </ol>
          <div className="atlas-next-prompt">A world opens with the first page.<br/><b>Which path will you take?</b></div>
        </aside>
      </div>
      <section className="atlas-discover" aria-label="Books in selected realm">
        <header><div><span className="lab-kicker">REGION / {current.name.toUpperCase()}</span>
          <h2>{region==='all'?'All discovered worlds':current.blurb+' collection'}</h2></div>
          <div><span>{visible.length} BOOKS</span>
            <button type="button" onClick={()=>setSort(sort==='progress'?'title':'progress')}>Order: {sort==='progress'?'Progress':'Title'} ↕</button>
          </div>
        </header>
        <div className="atlas-mosaic">
          {visible.map((book,index)=><button key={book.id} type="button"
            className={'atlas-mosaic-card atlas-mosaic-card-'+index%5}
            onClick={()=>select(book)} aria-label={'Explore '+book.title}>
            <div className="atlas-cover-holder"><BookCover book={book}/></div>
            <div className="atlas-mosaic-caption"><strong>{book.title}</strong><StatusPill book={book}/></div>
          </button>)}
        </div>
        {!visible.length&&<p className="lab-empty">No stories belong to this region yet. Choose another.</p>}
      </section>
    </div>
    {active&&<div className="atlas-inspector-shade" role="presentation">
      <aside className="atlas-inspector-drawer" role="dialog" aria-modal="true" aria-label={'Details for '+active.title}>
        <LayoutDetail book={active} select={select} read={read} styleName="atlas-detail"/>
      </aside>
    </div>}
  </div>;
}
