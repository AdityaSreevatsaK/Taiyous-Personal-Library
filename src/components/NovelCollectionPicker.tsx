import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { collectionTree, type BookCollection } from '../lib/collections';
import type { ReaderTheme } from '../types';

interface Props {
  bookId: string;
  bookTitle: string;
  theme: ReaderTheme;
  collections: BookCollection[];
  onToggle: (collectionId: string, include: boolean) => Promise<void>;
  onCreate: (name: string, parentId?: string) => Promise<void>;
  onClose: () => void;
}

/** Pick from existing nested collections or create one containing this novel.
 * Uses native in-app modal focus semantics and the existing collection store. */
export default function NovelCollectionPicker({
  bookId, bookTitle, theme, collections, onToggle, onCreate, onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const options = useMemo(() => collectionTree(collections), [collections]);
  const matching = options.filter(({ path }) =>
    path.normalize('NFKC').toLocaleLowerCase().includes(query.normalize('NFKC').trim().toLocaleLowerCase()));

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog?.open) dialog?.showModal();
    searchRef.current?.focus();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  async function toggle(id: string, include: boolean) {
    if (busy) return;
    setBusy(true); setError('');
    try { await onToggle(id, include); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !name.trim()) return;
    setBusy(true); setError('');
    try { await onCreate(name.trim(), parentId || undefined); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <dialog ref={dialogRef} className={'novel-collection-dialog theme-' + theme}
    aria-labelledby="novel-collection-title" aria-modal="true"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <button type="button" className="novel-collection-close" aria-label="Close collection picker"
      onClick={onClose}>×</button>
    <h2 id="novel-collection-title">Add to collection</h2>
    <p className="novel-collection-context">{bookTitle}</p>
    <label htmlFor="novel-collection-search">Search collections</label>
    <input ref={searchRef} id="novel-collection-search" type="search" value={query}
      placeholder="Search collection names…" autoComplete="off"
      onChange={event => setQuery(event.target.value)} />
    <ul className="novel-collection-entries" aria-label="Available collections">
      {matching.map(({ collection, path }) => {
        const included = collection.bookIds.includes(bookId);
        return <li key={collection.id}>
          <span>{path}</span>
          <button type="button" disabled={busy} aria-pressed={included}
            className={included ? 'is-added' : ''}
            aria-label={(included ? 'Remove novel from ' : 'Add novel to ') + path}
            onClick={() => void toggle(collection.id, !included)}>
            {busy ? 'Saving…' : included ? '✓ Added' : 'Add'}
          </button>
        </li>;
      })}
      {!matching.length && <li><span>{query ? 'No matching collections.' : 'No collections yet. Create one below.'}</span></li>}
    </ul>
    <details className="novel-collection-create">
      <summary>Create a new collection</summary>
      <form onSubmit={event => void create(event)}>
        <label htmlFor="novel-new-collection-name">Collection name</label>
        <input id="novel-new-collection-name" maxLength={90} value={name} autoComplete="off"
          onChange={event => setName(event.target.value)} placeholder="e.g. Favourite adventures" />
        <label htmlFor="novel-new-collection-parent">Place inside (optional)</label>
        <select id="novel-new-collection-parent" value={parentId}
          onChange={event => setParentId(event.target.value)}>
          <option value="">Top-level collection</option>
          {options.map(({ collection, path }) => <option key={collection.id} value={collection.id}>{path}</option>)}
        </select>
        <button type="submit" disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Create and add novel'}</button>
      </form>
    </details>
    {error && <p className="novel-collection-error" role="alert">{error}</p>}
  </dialog>;
}
