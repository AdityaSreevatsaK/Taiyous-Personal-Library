import { Fragment, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Check, LockKeyhole, Search, ShieldCheck, ShieldOff, Trash2 } from 'lucide-react';
import type { LibraryBook, ReaderTheme } from '../types';
import { normalizeTags } from '../lib/tags';
import { ratingLabel } from '../lib/ratings';
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
  onDeleteNovel: (id: string) => Promise<void>;
  staleCount: number;
  onArchiveStale: () => Promise<number>;
}
type RowProps = Pick<Props, 'onSaveRating' | 'onCorrectMetadata' | 'onMarkCompleted' |
  'onResetProgress' | 'onSaveTags' | 'onSaveSummary' | 'onSaveReview' | 'onExportEpub' | 'onDeleteNovel'> &
  { book: LibraryBook; duplicate: boolean };

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

/** Each immutable record is managed independently. Edits never replace an EPUB. */
function BookRow({ book, onCorrectMetadata, onMarkCompleted, onResetProgress,
  onSaveTags, onSaveSummary, onSaveReview, onExportEpub, onDeleteNovel, duplicate }: RowProps) {
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
    if (!result) return;
    const timeout = window.setTimeout(() => setResult(''), 8000);
    return () => window.clearTimeout(timeout);
  }, [result]);
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
      <td>{book.personalRating ? book.personalRating + '/10 · ' + ratingLabel(book.personalRating) : 'Not rated'}</td>
      <td><div className="master-record-actions">
        <button type="button" className="master-manage" aria-expanded={expanded}
          aria-controls={'master-edit-' + book.id} onClick={() => setExpanded(value => !value)}>
          {expanded ? 'Close controls' : 'Manage novel'}
        </button>
        {duplicate && <button type="button" className="master-danger-outline"
          disabled={busy} title="Requires exporting this exact EPUB first"
          onClick={() => void run(() => onDeleteNovel(book.id), 'Opening protected deletion confirmation')}>
          Delete copy…
        </button>}
      </div></td>
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
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}/10 · {ratingLabel(n)}</option>)}
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
        <button type="button" disabled={busy} onClick={() => void run(() => onExportEpub(book.id), 'EPUB export initiated; verify the download before deleting')}>Export EPUB backup</button>
        <button type="button" className="master-danger-outline" disabled={busy}
          onClick={() => void run(() => onDeleteNovel(book.id), 'Opening protected deletion confirmation')}>Delete this copy…</button>
      </div>
      {result && <p className="master-result" role="status">{result}</p>}
    </td></tr>}
  </>;
}

export default function MasterControls({
  books, cachedEpubIds, theme, onExit, onClearOffline, onSaveRating, onCorrectMetadata,
  onMarkCompleted, onResetProgress, onSaveTags, onSaveSummary, onSaveReview, onExportEpub,
  onDeleteNovel, staleCount, onArchiveStale,
}: Props) {
  const [status, setStatus] = useState<OwnerStatus | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(25);
  const loadMoreRef = useRef<HTMLTableRowElement | null>(null);
  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(''), 8000);
    return () => window.clearTimeout(timeout);
  }, [message]);
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
  // Render 25 records initially and add 25 when the reader reaches the 15th
  // visible row. Unlike page buttons, no scroll-position reset is required.
  const onPage = list.slice(0, visibleCount);
  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || visibleCount >= list.length) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        setVisibleCount(previous => Math.min(list.length, previous + 25));
      }
    }, { rootMargin: '0px 0px 200px 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [visibleCount, list.length, search]);
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
      {staleCount > 0 && <section className="master-panel" aria-labelledby="master-stale-heading">
        <h2 id="master-stale-heading">Historical browser records</h2>
        <p>{staleCount} old entries are absent from the verified cloud catalogue and have no EPUB saved here. They are hidden, but their annotations remain on this device.</p>
        <button type="button" className="master-manage" disabled={busy} onClick={() => {
          if (!window.confirm('Export a JSON backup, then archive only records that are absent from the live private cloud catalogue and have no local EPUB? No EPUB or cloud data will be deleted.')) return;
          setBusy(true); setError(''); setMessage('');
          void onArchiveStale().then(count => setMessage(count + ' historical records archived safely. Their metadata and progress remain recoverable from the exported JSON and browser archive.'))
            .catch(reason => setError(errorMessage(reason))).finally(() => setBusy(false));
        }}>Back up and archive {staleCount} stale records</button>
      </section>}
      <section className="master-panel" aria-labelledby="master-records-heading">
        <div className="master-record-heading"><div><h2 id="master-records-heading">Manage novel records</h2>
          <p>Expand a novel to edit titles, authors, ratings, private notes, tags and progress. Hosted title corrections use an Owner-authorised, revision-safe catalogue commit; EPUBs remain unchanged.</p>
          {duplicateKeys.size > 0 && <p className="master-duplicate-guidance">Potential local/hosted duplicates detected. Both IDs and EPUB copies remain preserved. Export and compare before considering removal.</p>}</div>
          <label className="master-search"><Search size={16}/><input aria-label="Search master records"
            value={search} placeholder="Search title, author or ID…" onChange={event=>{setSearch(event.target.value);setVisibleCount(25);}} /></label>
        </div>
        <div className="master-table-scroller">
          <table><thead><tr><th>Novel</th><th>Storage</th><th>Reading</th><th>Rating</th><th>Actions</th></tr></thead>
          <tbody>{onPage.map((book, index) => <Fragment key={book.id}>
            <BookRow book={book} duplicate={isDuplicate(book)}
              onSaveRating={onSaveRating} onCorrectMetadata={onCorrectMetadata}
              onMarkCompleted={onMarkCompleted} onResetProgress={onResetProgress}
              onSaveTags={onSaveTags} onSaveSummary={onSaveSummary}
              onSaveReview={onSaveReview} onExportEpub={onExportEpub}
              onDeleteNovel={onDeleteNovel}/>
            {index === Math.max(0, onPage.length - 11) && visibleCount < list.length &&
              <tr className="master-lazy-trigger" ref={loadMoreRef} aria-hidden="true"><td colSpan={5} /></tr>}
          </Fragment>)}</tbody></table>
        </div>
        {!list.length && <p>No matching records.</p>}
        <div className="master-pages" role="status" aria-live="polite">
          <span>Showing {onPage.length} of {list.length} records{onPage.length < list.length ? ' · More load as you scroll' : ''}</span>
          {onPage.length < list.length && <button type="button" onClick={() => setVisibleCount(n => Math.min(list.length, n + 25))}>Load more</button>}
        </div>
      </section>
    </>}
  </section>;
}
