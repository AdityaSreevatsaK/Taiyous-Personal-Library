
import { useCallback, useEffect, useState } from 'react';
import type { ReaderTheme } from '../../types';
import { seedPreviewBooks } from '../preview-fixtures';
import { THEME_OPTIONS } from '../themes';
import {
  CONCEPTS, LAB_BOOKS, type ConceptId, type ConceptProps, type LabBook,
} from './core';
import GrandLibrary from './GrandLibrary';
import ReadingDesk from './ReadingDesk';
import BookshelfHouse from './BookshelfHouse';
import CollectionAtlas from './CollectionAtlas';
import LiteraryJournal from './LiteraryJournal';
import './lab.css';

function fromHash(): ConceptId {
  const hash = window.location.hash.replace('#','');
  return CONCEPTS.some(concept=>concept.id===hash)?hash as ConceptId:'grand';
}

export default function LayoutLab() {
  const [concept,setConcept]=useState<ConceptId>(fromHash);
  const [theme,setTheme]=useState<ReaderTheme>('sepia');
  const [active,setActive]=useState<LabBook|null>(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{
    const change=()=>{setConcept(fromHash());setActive(null);window.scrollTo(0,0);};
    window.addEventListener('hashchange',change);
    return()=>window.removeEventListener('hashchange',change);
  },[]);
  useEffect(()=>{
    let mounted=true;
    void seedPreviewBooks().then(()=>{if(mounted)setReady(true);})
      .catch(reason=>{if(mounted)setError(String(reason));});
    return()=>{mounted=false;};
  },[]);
  const read=useCallback((book:LabBook)=>{
    if(!ready){setError('Sample EPUBs are still being prepared. Open the sample reader when ready.');return;}
    window.location.assign('/book/'+book.id+'/read');
  },[ready]);
  const props:ConceptProps={books:LAB_BOOKS,active,select:setActive,read,theme};
  return <div className="layout-lab" data-theme={theme}>
    <header className="lab-labbar">
      <div className="lab-brand"><span className="lab-sun" aria-hidden="true">☼</span>
        <div><strong>TAIYOU / DESIGN LAB</strong><span>FIVE DIFFERENT LAYOUTS</span></div>
      </div>
      <nav className="lab-concepts-nav" aria-label="Design concept navigation">
        {CONCEPTS.map((item,index)=><a key={item.id} href={'#'+item.id}
          aria-current={concept===item.id?'page':undefined}
          className={concept===item.id?'current':''}>
          <b>{String(index+1).padStart(2,'0')}</b>{item.title}
        </a>)}
      </nav>
      <div className="labbar-right">
        <div className="lab-theme-options" role="group" aria-label="Design lab palette">
          {THEME_OPTIONS.map(item=><button key={item.id} type="button"
            aria-pressed={theme===item.id} onClick={()=>setTheme(item.id)} title={item.description}>
            {item.shortLabel}
          </button>)}
        </div>
        <a className="lab-real-link" href="/">Existing app ↗</a>
      </div>
    </header>
    <div className="lab-labnote" role="note">
      Five structural design explorations · Eight fictional books · No live user data or private cloud
      {!ready&&!error&&' · Preparing original sample EPUB chapters…'}
      {error&&<span role="alert"> · {error}</span>}
    </div>
    <div className="lab-concept-caption">
      <span><strong>{CONCEPTS.find(item=>item.id===concept)?.title}</strong> ·
        {CONCEPTS.find(item=>item.id===concept)?.subtitle}</span>
      <span>Click a novel to inspect it. “Read” opens the real EPUB reader with an original sample book.</span>
    </div>
    <div className="lab-stage" key={concept}>
      {concept==='grand'&&<GrandLibrary {...props}/>}
      {concept==='desk'&&<ReadingDesk {...props}/>}
      {concept==='shelves'&&<BookshelfHouse {...props}/>}
      {concept==='atlas'&&<CollectionAtlas {...props}/>}
      {concept==='journal'&&<LiteraryJournal {...props}/>}
    </div>
  </div>;
}
