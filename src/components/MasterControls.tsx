import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, LockKeyhole, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { normalizeTags } from '../lib/tags';
import { getOwnerStatus, ownerPost, type OwnerStatus } from '../lib/owner';
import './master-controls.css';

interface Props {
  books: LibraryBook[];
  cachedEpubIds: string[];
  theme: ReaderTheme;
  onExit: () => void;
  onClearOffline: () => Promise<{ removed: number; kept: number }>;
  onSaveRating: (id: string, rating: number | undefined) => Promise<void>;
  onCorrectMetadata: (id: string, title: string, author: string) => Promise<void>;
  onMarkCompleted: (id: string) => Promise<void>;
  onResetProgress: (id: string) => Promise<void>;
  onSaveTags: (id: string, tags: string[]) => Promise<void>;
  onSaveSummary: (id: string, summary: string) => Promise<void>;
  onSaveReview: (id: string, rating: number | undefined, notes: string) => Promise<void>;
  onExportEpub: (id: string) => Promise<void>;
}
type RowProps = Pick<Props, 'onSaveRating' | 'onCorrectMetadata' | 'onMarkCompleted' |
  'onResetProgress' | 'onSaveTags' | 'onSaveSummary' | 'onSaveReview' | 'onExportEpub'> &
  { book: LibraryBook; duplicate: boolean };

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Each immutable record is managed independently. Edits never replace an EPUB. */
function BookRow({ book, onSaveRating, onCorrectMetadata, onMarkCompleted, onResetProgress,
  onSaveTags, onSaveSummary, onSaveReview, onExportEpub, duplicate }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [rating, setRating] = useState(book.personalRating?.toString() ?? '');
  const [personalTags, setPersonalTags] = useState((book.personalTags || []).join(', '));
  const [summary, setSummary] = useState(book.userDescription || book.description || '');
  const [notes, setNotes] = useState(book.personalReview || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    setTitle(book.title); setAuthor(book.author);
    setRating(book.personalRating?.toString() ?? '');
    setPersonalTags((book.personalTags || []).join(', '));
    setSummary(book.userDescription || book.description || '');
    setNotes(book.personalReview || '');
  }, [book.id, book.title, book.author, book.personalRating, book.personalTags,
    book.userDescription, book.description, book.personalReview]);

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true); setResult('');
    try { await action(); setResult(success); }
    catch (reason) { setResult(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  const newTitle = title.trim().replace(/\s+/g, ' ');
  const newAuthor = author.trim().replace(/\s+/g, ' ');
  const metadataChanged = newTitle !== book.title || newAuthor !== book.author;
  const tags = normalizeTags(personalTags);
  const tagsChanged = JSON.stringify(tags) !== JSON.stringify(normalizeTags(book.personalTags || []));
  const summaryChanged = summary.trim() !== (book.userDescription || book.description || '').trim();
  const reviewChanged = notes !== (book.personalReview || '') || rating !== (book.personalRating?.toString() || '');
  return <>
    <tr className={expanded ? 'master-record-active' : ''}>
      <td><strong>{book.title}</strong>
        <small title={book.id}>{book.cloud ? 'Hosted' : 'Local only'} · {book.id}</small>
        {duplicate && <small className="master-duplicate">Possible local/hosted duplicate, both preserved</small>}
      </td>
      <td>{book.cloud ? 'Private cloud' : 'This browser'}{book.progressUpdatedAt && book.pendingProgressSync ? <small>Progress awaiting sync</small> : null}</td>
      <td>{book.progress >= 99.5 ? 'Finished' : book.progress > 0 ? 'Reading' : 'Not started'}
        {book.progress > 0 && <small>{Math.round(book.progress)}% · {book.currentChapter || 'Position saved'}</small>}
      </td>
      <td>{book.personalRating ? book.personalRating + '/10' : 'Not rated'}</td>
      <td><button type="button" className="master-manage" aria-expanded={expanded}
        aria-controls={'master-edit-' + book.id} onClick={() => setExpanded(value => !value)}>
        {expanded ? 'Close controls' : 'Manage novel'}
      </button></td>
    </tr>
    {expanded && <tr className="master-expanded-row" id={'master-edit-' + book.id}><td colSpan={5}>
      <div className="master-record-info">
        <span><b>ID:</b> {book.id}</span>
        <span><b>Chapters:</b> {book.chapterCount?.toLocaleString() || 'Unknown'}</span>
        <span><b>Language:</b> {book.language || 'Unknown'}</span>
        <span><b>Source status:</b> {book.status || 'Not supplied'}</span>
        {book.sourceUrl && <a href={book.sourceUrl} target="_blank" rel="noopener noreferrer">Original source</a>}
      </div>
      {duplicate && <p className="master-duplicate-guidance">This title also exists under another novel ID. Compare the records and export EPUB copies before deciding whether either is redundant. No automatic deletion or merging is performed.</p>}
      <div className="master-editor-grid">
        <div className="master-editor-group">
          <h3>Title and author</h3>
          <label htmlFor={'master-title-' + book.id}>Correct title</label>
          <input id={'master-title-' + book.id} value={title} maxLength={255} onChange={event => setTitle(event.target.value)} />
          <label htmlFor={'master-author-' + book.id}>Correct author</label>
          <input id={'master-author-' + book.id} value={author} maxLength={160} onChange={event => setAuthor(event.target.value)} />
          <button type="button" disabled={busy || !metadataChanged || !newTitle || !newAuthor}
            onClick={() => {
              if (window.confirm('Correct title and author for ' + book.title + '? The immutable ID, EPUB and saved reading data will remain unchanged.')) {
                void run(() => onCorrectMetadata(book.id, newTitle, newAuthor), 'Title and author saved');
              }
            }}>Save title and author</button>
        </div>
        <div className="master-editor-group">
          <h3>Personal rating and notes</h3>
          <label htmlFor={'master-rating-' + book.id}>Rating</label>
          <select id={'master-rating-' + book.id} value={rating} onChange={event => setRating(event.target.value)}>
            <option value="">Not rated</option>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}/10</option>)}
          </select>
          <label htmlFor={'master-notes-' + book.id}>Private reading notes</label>
          <textarea id={'master-notes-' + book.id} rows={3} maxLength={10000} value={notes} onChange={event => setNotes(event.target.value)} />
          <button type="button" disabled={busy || !reviewChanged}
            onClick={() => void run(() => onSaveReview(book.id, rating ? Number(rating) : undefined, notes), 'Rating and notes saved')}>Save rating and notes</button>
        </div>
        <div className="master-editor-group">
          <h3>Tags</h3>
          <p>Imported genres: {(book.sourceTags || []).join(', ') || 'None'} (read only)</p>
          <label htmlFor={'master-tags-' + book.id}>Personal tags (comma-separated)</label>
          <textarea id={'master-tags-' + book.id} rows={3} maxLength={3000} value={personalTags} onChange={event => setPersonalTags(event.target.value)} />
          <button type="button" disabled={busy || !tagsChanged}
            onClick={() => {
              if (window.confirm('Save personal tags for ' + book.title + '? Imported genres remain untouched.')) {
                void run(() => onSaveTags(book.id, tags), 'Personal tags saved');
              }
            }}>Save personal tags</button>
        </div>
        <div className="master-editor-group">
          <h3>Synopsis</h3>
          <label htmlFor={'master-summary-' + book.id}>Personal synopsis override</label>
          <textarea id={'master-summary-' + book.id} rows={5} maxLength={24000} value={summary} onChange={event => setSummary(event.target.value)} />
          <p>Saved locally; the original imported synopsis is preserved.</p>
          <button type="button" disabled={busy || !summaryChanged}
            onClick={() => {
              if (window.confirm('Save synopsis for ' + book.title + '?')) {
                void run(() => onSaveSummary(book.id, summary), 'Synopsis saved locally');
              }
            }}>Save synopsis</button>
        </div>
      </div>
      <div className="master-reading-controls">
        <div><h3>Reading progress</h3><p>{book.progress > 0 ? Math.round(book.progress) + '% complete' : 'Not started'}{book.currentChapterNumber ? ' · Chapter ' + book.currentChapterNumber : ''}. Notes, ratings and the EPUB are unaffected by these actions.</p></div>
        <button type="button" disabled={busy || book.progress >= 99.5}
          onClick={() => {
            if (window.confirm('Mark ' + book.title + ' as completed?')) {
              void run(() => onMarkCompleted(book.id), 'Marked as completed');
            }
          }}>Mark as completed</button>
        <button type="button" className="master-danger-outline" disabled={busy || (book.progress === 0 && !book.lastCfi && !book.currentChapter)}
          onClick={() => {
            if (!window.confirm('Reset the saved reading position for ' + book.title + '? This will synchronise a blank reading position to your private cloud when connected.')) return;
            if (window.prompt('Type RESET PROGRESS to confirm') !== 'RESET PROGRESS') return;
            void run(() => onResetProgress(book.id), 'Reading progress reset');
          }}>Reset progress</button>
        <button type="button" disabled={busy} onClick={() => void run(() => onExportEpub(book.id), 'EPUB export initiated')}>Export EPUB backup</button>
      </div>
      {result && <p className="master-result" role="status">{result}</p>}
    </td></tr>}
  </>;
}

export default function MasterControls({
  books, cachedEpubIds, theme, onExit, onClearOffline, onSaveRating, onCorrectMetadata,
  onMarkCompleted, onResetProgress, onSaveTags, onSaveSummary, onSaveReview, onExportEpub,
}: Props) {
  const [status, setStatus] = useState<OwnerStatus | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  useEffect(() => {
    let active = true;
    void getOwnerStatus().then(value => { if (active) setStatus(value); })
      .catch(reason => { if (active) setError('Owner access unavailable: ' + errorMessage(reason)); });
    const timer = window.setInterval(() => {
      setStatus(prev => prev?.unlocked && prev.expiresAt && prev.expiresAt <= Date.now()
        ? { ...prev, unlocked:false } : prev);
    }, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const list = useMemo(() => books.filter(book =>
    (book.title + ' ' + book.author + ' ' + book.id).toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))
    .sort((a,b)=>a.title.localeCompare(b.title, undefined, { numeric:true })), [books,search]);
  const perPage = 25;
  const pages = Math.max(1,Math.ceil(list.length/perPage));
  const currentPage = Math.min(page,pages-1);
  const onPage = list.slice(currentPage * perPage,(currentPage+1)*perPage);
  const cached = books.filter(book => cachedEpubIds.includes(book.id));
  const hostedCached = cached.filter(book=>book.cloud).length;
  const localOnlyCached = cached.filter(book=>!book.cloud).length;
  const duplicateKeys = useMemo(() => {
    const keys = new Map<string, { hosted: boolean; local: boolean }>();
    for (const book of books) {
      const key = JSON.stringify([book.title.normalize('NFKC').trim().toLocaleLowerCase(),
        book.author.normalize('NFKC').trim().toLocaleLowerCase()]);
      const found = keys.get(key) || { hosted: false, local: false };
      if (book.cloud) found.hosted = true; else found.local = true;
      keys.set(key, found);
    }
    return new Set([...keys].filter(([, pair]) => pair.hosted && pair.local).map(([key]) => key));
  }, [books]);
  const isDuplicate = (book: LibraryBook) => duplicateKeys.has(JSON.stringify([
    book.title.normalize('NFKC').trim().toLocaleLowerCase(),
    book.author.normalize('NFKC').trim().toLocaleLowerCase(),
  ]));

  async function unlock(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setBusy(true);
    try {
      const result = await ownerPost('unlock',passphrase);
      setStatus(result); setPassphrase('');
    } catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function lock() {
    setBusy(true);setMessage('');
    try { setStatus(await ownerPost('lock')); }
    catch (reason) { setError(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function clearSafeCache() {
    if (busy || !hostedCached) return;
    if (!window.confirm('Remove all safely verified hosted EPUB downloads from this browser? Private cloud novels, progress, notes and local-only EPUBs will remain untouched.')) return;
    const typed = window.prompt('Type REMOVE DOWNLOADS to confirm bulk removal');
    if (typed !== 'REMOVE DOWNLOADS') return;
    setBusy(true); setError(''); setMessage('');
    try {
      await ownerPost('verify');
      const {removed,kept} = await onClearOffline();
      setMessage(removed + ' hosted EPUB downloads removed; ' + kept + ' copies preserved (unverified, missing or local-only).');
    } catch (reason) {
      setError(errorMessage(reason));
      if (/locked|expired|owner/i.test(errorMessage(reason))) setStatus(prev=>prev ? {...prev,unlocked:false}:null);
    } finally { setBusy(false); }
  }

  return <section className={`master-controls theme-${theme}`} aria-labelledby="master-title">
    <header className="master-header">
      <div>
        <span className="section-overline">PROTECTED LIBRARY ADMINISTRATION</span>
        <h1 id="master-title">Master Controls</h1>
        <p>Efficient library maintenance. No novel IDs, chapters, saved reading positions or private EPUBs are changed when editing metadata.</p>
      </div>
      <button type="button" className="master-back" onClick={onExit}>Back to library</button>
    </header>
    {!status && !error && <p role="status">Checking server-side Owner access…</p>}
    {status && !status.configured && <p className="master-warning" role="alert">
      Owner mode is not configured. Set <code>TAIYOU_OWNER_PASSPHRASE</code> as a Cloudflare Production Secret (16+ characters) and sign in with the owning Hugging Face account.
    </p>}
    {status?.configured && !status.unlocked && <form className="master-unlock" onSubmit={event=>void unlock(event)}>
      <LockKeyhole size={25} aria-hidden="true"/>
      <h2>Unlock Master Controls</h2>
      <p>Enter your independent Owner passphrase. It is checked by the server, not stored in your browser. Access expires automatically after 10 minutes.</p>
      <label htmlFor="master-owner-password">Owner passphrase</label>
      <input id="master-owner-password" type="password" autoComplete="off"
        value={passphrase} maxLength={256} onChange={event=>setPassphrase(event.target.value)}/>
      <button type="submit" disabled={busy || passphrase.length < 16}>
        <ShieldCheck size={16}/> {busy ? 'Checking…' : 'Unlock controls'}
      </button>
    </form>}
    {error && <p className="master-warning" role="alert"><AlertTriangle size={16}/>{error}</p>}
    {message && <p className="master-success" role="status"><Check size={16}/>{message}</p>}
    {status?.unlocked && <>
      <div className="master-unlocked"><ShieldCheck size={16} /> Owner access verified
        <button type="button" disabled={busy} onClick={()=>void lock()}><ShieldOff size={16}/> Lock now</button>
      </div>
      <section className="master-panel" aria-labelledby="master-offline-heading">
        <h2 id="master-offline-heading">Offline storage</h2>
        <p>Stored on this device: <strong>{cached.length} EPUBs</strong>, including {hostedCached} hosted copies and {localOnlyCached} local-only copies. Local-only files and downloads without a verifiable cloud backup are always kept.</p>
        <button type="button" className="master-danger" disabled={busy || !hostedCached}
          onClick={()=>void clearSafeCache()}><Trash2 size={17}/> Remove verified offline downloads</button>
        <small>Deletion affects EPUB files in this browser only, not your cloud library or reading progress. Each hosted backup is verified first.</small>
      </section>
      <section className="master-panel" aria-labelledby="master-records-heading">
        <div className="master-record-heading"><div><h2 id="master-records-heading">Manage novel records</h2>
          <p>Expand a novel to edit titles, authors, ratings, private notes, tags and progress. Hosted title corrections use an Owner-authorised, revision-safe catalogue commit; EPUBs remain unchanged.</p>
          {duplicateKeys.size > 0 && <p className="master-duplicate-guidance">Potential local/hosted duplicates detected. Both IDs and EPUB copies remain preserved. Export and compare before considering removal.</p>}</div>
          <label className="master-search"><Search size={16}/><input aria-label="Search master records"
            value={search} placeholder="Search title, author or ID…" onChange={event=>{setSearch(event.target.value);setPage(0);}} /></label>
        </div>
        <div className="master-table-scroller">
          <table><thead><tr><th>Novel</th><th>Storage</th><th>Reading</th><th>Rating</th><th>Actions</th></tr></thead>
          <tbody>{onPage.map(book=><BookRow key={book.id} book={book} duplicate={isDuplicate(book)}
            onSaveRating={onSaveRating} onCorrectMetadata={onCorrectMetadata}
            onMarkCompleted={onMarkCompleted} onResetProgress={onResetProgress}
            onSaveTags={onSaveTags} onSaveSummary={onSaveSummary}
            onSaveReview={onSaveReview} onExportEpub={onExportEpub}/>)}</tbody></table>
        </div>
        {!list.length && <p>No matching records.</p>}
        <div className="master-pages">
          <span>Showing {list.length ? currentPage*perPage+1 : 0}–{Math.min(list.length,(currentPage+1)*perPage)} of {list.length} records</span>
          <button type="button" disabled={!currentPage} onClick={()=>setPage(p=>Math.max(0,p-1))}>Previous</button>
          <button type="button" disabled={currentPage>=pages-1} onClick={()=>setPage(p=>Math.min(pages-1,p+1))}>Next</button>
        </div>
      </section>
    </>}
  </section>;
}
