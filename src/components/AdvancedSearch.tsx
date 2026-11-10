import { useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, Filter, Search, SlidersHorizontal, Star, Tag, X } from 'lucide-react';
import { bookTags } from '../lib/tags';
import type { LibraryBook } from '../types';
import type { CloudSession } from '../lib/cloud';
import { Cover } from './LibraryDashboard';

export type SearchMode = 'all' | 'any';

export interface SearchCriteria {
  name: string;
  comments: string;
  tags: string[];
  minRating: number;
  maxRating: number;
  offlineOnly: boolean;
  mode: SearchMode;
}

export const defaultSearchCriteria: SearchCriteria = {
  name: '', comments: '', tags: [], minRating: 0, maxRating: 10,
  offlineOnly: false, mode: 'all',
};

/** Search across only the active criteria. AND requires all; OR requires any. */
export function matchesAdvancedSearch(book: LibraryBook, criteria: SearchCriteria, offlineIds: ReadonlySet<string>): boolean {
  const tests: boolean[] = [];
  const name = criteria.name.trim().toLocaleLowerCase();
  const comments = criteria.comments.trim().toLocaleLowerCase();
  if (name) tests.push((book.title + ' ' + book.author).toLocaleLowerCase().includes(name));
  if (comments) tests.push((book.personalReview || '').toLocaleLowerCase().includes(comments));
  if (criteria.tags.length) {
    const owned = new Set(bookTags(book).map(tag => tag.toLocaleLowerCase()));
    // Selected tags are individually matchable when OR is selected.
    if (criteria.mode === 'any') {
      for (const tag of criteria.tags) tests.push(owned.has(tag.toLocaleLowerCase()));
    } else {
      tests.push(criteria.tags.every(tag => owned.has(tag.toLocaleLowerCase())));
    }
  }
  if (criteria.minRating > 0 || criteria.maxRating < 10) {
    const rating = book.personalRating;
    tests.push(rating !== undefined && rating >= criteria.minRating && rating <= criteria.maxRating);
  }
  if (criteria.offlineOnly) tests.push(offlineIds.has(book.id));
  return !tests.length || (criteria.mode === 'all' ? tests.every(Boolean) : tests.some(Boolean));
}

interface Props {
  books: LibraryBook[];
  offlineIds: string[];
  initialName?: string;
  cloudRepo: string;
  cloudSession: CloudSession | null;
  onClose: () => void;
  onOpen: (book: LibraryBook) => void;
  onBrowseTag?: (tag: string) => void;
}

export default function AdvancedSearch({ books, offlineIds, initialName = '', cloudRepo, cloudSession, onClose, onOpen, onBrowseTag }: Props) {
  const [criteria, setCriteria] = useState<SearchCriteria>({ ...defaultSearchCriteria, name: initialName });
  const [sort, setSort] = useState<'title' | 'rating' | 'recent'>('title');
  const availableTags = useMemo(
    () => [...new Set(books.flatMap(bookTags))].sort((a, b) => a.localeCompare(b)), [books]);
  const cached = useMemo(() => new Set(offlineIds), [offlineIds]);
  const results = useMemo(() => books.filter(book => matchesAdvancedSearch(book, criteria, cached)).sort((a, b) =>
    sort === 'rating' ? (b.personalRating ?? -1) - (a.personalRating ?? -1) || a.title.localeCompare(b.title)
      : sort === 'recent' ? (b.lastOpenedAt || 0) - (a.lastOpenedAt || 0)
        : a.title.localeCompare(b.title)), [books, criteria, cached, sort]);
  const update = <K extends keyof SearchCriteria>(key: K, value: SearchCriteria[K]) =>
    setCriteria(previous => ({ ...previous, [key]: value }));
  const toggleTag = (tag: string) => setCriteria(previous => ({
    ...previous, tags: previous.tags.includes(tag)
      ? previous.tags.filter(item => item !== tag) : [...previous.tags, tag],
  }));
  return <section className="advanced-search-page" aria-label="Advanced novel search">
    <div className="advanced-search-heading">
      <div><span className="section-overline">EXPLORE YOUR COLLECTION</span>
        <h1><SlidersHorizontal size={29} /> Find a story</h1>
        <p>Combine titles, comments, tags and ratings. Search your entire local catalogue.</p>
      </div>
      <button type="button" className="secondary-button" onClick={onClose}><ArrowLeft size={15} /> Back to shelf</button>
    </div>
    <div className="advanced-search-layout">
      <aside className="advanced-filter-panel" aria-label="Advanced search filters">
        <div className="advanced-panel-heading"><Filter size={18}/><strong>Filters</strong>
          <button type="button" onClick={() => setCriteria({ ...defaultSearchCriteria })}>Clear all</button>
        </div>
        <label className="advanced-field">Novel name or author
          <span><Search size={16}/><input aria-label="Search by novel name or author" value={criteria.name}
            onChange={event => update('name', event.target.value)} placeholder="Title or author…" /></span>
        </label>
        <label className="advanced-field">Words in my comments
          <span><Search size={16}/><input aria-label="Search personal comments" value={criteria.comments}
            onChange={event => update('comments', event.target.value)} placeholder="e.g. excellent romance" /></span>
        </label>
        <div className="advanced-field"><span className="advanced-field-label"><Star size={15}/> Personal rating</span>
          <div className="advanced-rating-range">
            <label>From<select aria-label="Minimum rating" value={criteria.minRating}
              onChange={event => update('minRating', Math.min(Number(event.target.value), criteria.maxRating))}>
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Any' : i + '/10'}</option>)}
            </select></label>
            <label>To<select aria-label="Maximum rating" value={criteria.maxRating}
              onChange={event => update('maxRating', Math.max(Number(event.target.value), criteria.minRating))}>
              {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i === 10 ? 'Any' : i + '/10'}</option>)}
            </select></label>
          </div>
        </div>
        <fieldset className="advanced-tags"><legend><Tag size={15}/> Tags</legend>
          <div className="advanced-tag-options">
            {availableTags.length ? availableTags.map(tag => <label key={tag} className={criteria.tags.includes(tag) ? 'checked' : ''}>
              <input type="checkbox" checked={criteria.tags.includes(tag)} onChange={() => toggleTag(tag)}/>{tag}
            </label>) : <small>No novel tags available yet.</small>}
          </div>
        </fieldset>
        <label className="advanced-offline-check"><input type="checkbox" checked={criteria.offlineOnly}
          onChange={event => update('offlineOnly', event.target.checked)}/> Available offline on this device</label>
        <fieldset className="advanced-match"><legend>How should filters combine?</legend>
          <label><input type="radio" name="advanced-match" checked={criteria.mode === 'all'}
            onChange={() => update('mode', 'all')}/> Match all (intersection)</label>
          <label><input type="radio" name="advanced-match" checked={criteria.mode === 'any'}
            onChange={() => update('mode', 'any')}/> Match any (union)</label>
        </fieldset>
      </aside>
      <div className="advanced-result-panel">
        <div className="advanced-results-header">
          <div><span className="section-overline">MATCHING BOOKS</span>
            <h2>{results.length} {results.length === 1 ? 'story' : 'stories'} found</h2></div>
          <label>Sort by <select aria-label="Sort advanced search results" value={sort}
            onChange={event => setSort(event.target.value as typeof sort)}>
            <option value="title">Title A–Z</option><option value="rating">Highest rated</option>
            <option value="recent">Recently read</option>
          </select></label>
        </div>
        <p className="advanced-mode-hint">{criteria.mode === 'all'
          ? 'A book must meet every active filter.' : 'A book may meet any active filter.'}</p>
        {results.length ? <div className="advanced-results-grid">
          {results.map(book => <article className="advanced-result" key={book.id}>
            <button type="button" className="advanced-result-cover" onClick={() => onOpen(book)}
              aria-label={`View details for ${book.title}`}><Cover book={book} cloudRepo={cloudRepo} cloudSession={cloudSession}/></button>
            <div className="advanced-result-details">
              <button type="button" className="advanced-result-title" onClick={() => onOpen(book)}>{book.title}</button>
              <p>{book.author || 'Unknown author'}</p>
              <div className="advanced-result-meta">{book.personalRating
                ? <span><Star size={13} fill="currentColor"/>{book.personalRating}/10</span>
                : <span>Unrated</span>}
                {cached.has(book.id) && <span><BookOpen size={13}/> Offline</span>}
              </div>
              {bookTags(book).length > 0 && <div className="advanced-result-tags">
                {bookTags(book).slice(0, 5).map(tag => <button type="button" key={tag}
                  onClick={() => onBrowseTag?.(tag)}>{tag}</button>)}
              </div>}
              {book.personalReview && <p className="advanced-result-note">{book.personalReview.slice(0, 160)}</p>}
            </div>
          </article>)}
        </div> : <div className="no-results"><Search size={30}/><h3>No matching books</h3>
          <p>Try fewer filters, a different rating range, or Match any.</p>
          <button type="button" className="secondary-button" onClick={() => setCriteria({ ...defaultSearchCriteria })}><X size={14}/> Reset filters</button>
        </div>}
      </div>
    </div>
  </section>;
}
