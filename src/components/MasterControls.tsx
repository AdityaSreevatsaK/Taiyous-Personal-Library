import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, LockKeyhole, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
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
}

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Edits are scoped to one immutable novel ID; no catalogue file is uploaded from the browser. */
function BookRow({ book, onSaveRating, onCorrectMetadata }: Pick<Props,'onSaveRating'|'onCorrectMetadata'> & { book: LibraryBook }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [rating, setRating] = useState(book.personalRating?.toString() ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState('');
  useEffect(() => {
    setTitle(book.title); setAuthor(book.author);
    setRating(book.personalRating?.toString() ?? '');
  }, [book.id, book.title, book.author, book.personalRating]);

  async function saveRating() {
    if (busy) return;
    setBusy(true); setResult('');
    try {
      await onSaveRating(book.id, rating ? Number(rating) : undefined);
      setResult('Rating saved');
    } catch (reason) { setResult(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  async function saveMetadata() {
    if (busy) return;
    const nextTitle = title.trim().replace(/\s+/g, ' ');
    const nextAuthor = author.trim().replace(/\s+/g, ' ');
    if (!nextTitle || !nextAuthor) { setResult('Title and author are required'); return; }
    if (!window.confirm('Correct the title/author for “' + book.title + '”? The original novel ID, EPUB, cover, notes and progress will not change.')) return;
    setBusy(true); setResult('');
    try {
      await onCorrectMetadata(book.id, nextTitle, nextAuthor);
      setResult('Metadata saved');
    } catch (reason) { setResult(errorMessage(reason)); }
    finally { setBusy(false); }
  }
  const changed = title.trim() !== book.title || author.trim() !== book.author;
  return <tr>
    <td>
      <strong>{book.title}</strong>
      <small title={book.id}>{book.cloud ? 'Hosted' : 'Local only'} · {book.id.slice(0,8)}…</small>
    </td>
    <td><input aria-label={'Correct title for ' + book.title} value={title}
      onChange={event => setTitle(event.target.value)} maxLength={255}/></td>
    <td><input aria-label={'Correct author for ' + book.title} value={author}
      onChange={event => setAuthor(event.target.value)} maxLength={160}/></td>
    <td>
      <select aria-label={'Rating for ' + book.title} value={rating}
        onChange={event => setRating(event.target.value)}>
        <option value="">Unrated</option>
        {Array.from({length:10}, (_,index)=>index+1).map(value=>
          <option key={value} value={value}>{value}/10</option>)}
      </select>
    </td>
    <td className="master-row-actions">
      <button type="button" disabled={busy || rating === (book.personalRating?.toString() ?? '')}
        onClick={() => void saveRating()}>Save rating</button>
      <button type="button" disabled={busy || !changed} onClick={() => void saveMetadata()}>Correct metadata</button>
      {result && <small role="status">{result}</small>}
    </td>
  </tr>;
}

export default function MasterControls({
  books, cachedEpubIds, theme, onExit, onClearOffline, onSaveRating, onCorrectMetadata,
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
        <div className="master-record-heading"><div><h2 id="master-records-heading">Titles, authors and ratings</h2>
          <p>Edits are saved per novel. Hosted title corrections require an Owner-authorised, revision-safe catalogue commit; no ebook files are replaced.</p></div>
          <label className="master-search"><Search size={16}/><input aria-label="Search master records"
            value={search} placeholder="Search title, author or ID…" onChange={event=>{setSearch(event.target.value);setPage(0);}} /></label>
        </div>
        <div className="master-table-scroller">
          <table><thead><tr><th>Novel</th><th>Correct title</th><th>Correct author</th><th>Rating</th><th>Actions</th></tr></thead>
          <tbody>{onPage.map(book=><BookRow key={book.id} book={book}
            onSaveRating={onSaveRating} onCorrectMetadata={onCorrectMetadata}/>)}</tbody></table>
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
