
import type { CSSProperties } from 'react';
import type { ReaderTheme } from '../../types';
import { PREVIEW_BOOKS } from '../preview-fixtures';

export type ConceptId = 'grand' | 'desk' | 'shelves' | 'atlas' | 'journal';
export type LabFilter = 'all' | 'reading' | 'trying' | 'unread';
export interface LabBook {
  id: string;
  title: string;
  author: string;
  tags: readonly string[];
  description: string;
  progress: number;
  rating?: number;
  trying: boolean;
  symbol: string;
  ink: string;
  colour: string;
  chapters: number;
}
export interface ConceptProps {
  books: LabBook[];
  active: LabBook | null;
  select: (book: LabBook | null) => void;
  read: (book: LabBook) => void;
  theme: ReaderTheme;
}

const ornaments = [
  ['道', '#1f4c44', '#a8793f'], ['九', '#4c342c', '#b87f50'],
  ['灵', '#274f56', '#8a9c8c'], ['春', '#593f55', '#d39b85'],
  ['书', '#283b56', '#9d8192'], ['剑', '#46372a', '#c79952'],
  ['莲', '#3a5260', '#c6aa8a'], ['焰', '#56352d', '#b86c47'],
] as const;

export const LAB_BOOKS: LabBook[] = PREVIEW_BOOKS.map((item, index) => ({
  ...item,
  trying: 'trying' in item && item.trying === true,
  symbol: ornaments[index][0],
  ink: ornaments[index][1],
  colour: ornaments[index][2],
  chapters: 4,
}));

export const CONCEPTS: readonly { id: ConceptId; title: string; subtitle: string }[] = [
  { id: 'grand', title: 'Grand Library', subtitle: 'Cinematic discovery' },
  { id: 'desk', title: 'Reading Desk', subtitle: 'Split-pane focus' },
  { id: 'shelves', title: 'Bookshelf House', subtitle: 'Tactile shelves' },
  { id: 'atlas', title: 'Collection Atlas', subtitle: 'Visual exploration' },
  { id: 'journal', title: 'Literary Journal', subtitle: 'Editorial reading log' },
];

export function filterBooks(books: LabBook[], filter: LabFilter, search = ''): LabBook[] {
  const q = search.trim().toLocaleLowerCase();
  return books.filter(book => {
    const categoryMatches =
      filter === 'all' ||
      (filter === 'reading' && book.progress > 0) ||
      (filter === 'trying' && book.trying) ||
      (filter === 'unread' && book.progress === 0 && !book.trying);
    return categoryMatches && (!q ||
      [book.title, book.author, ...book.tags].join(' ').toLocaleLowerCase().includes(q));
  });
}

export function BookCover({ book, variant = '' }: { book: LabBook; variant?: string }) {
  const style = { '--lab-book-ink': book.ink, '--lab-book-colour': book.colour } as CSSProperties;
  return <div className={'lab-book-cover ' + variant} style={style}>
    <span className="lab-cover-crest" aria-hidden="true">{book.symbol}</span>
    <span className="lab-cover-name">{book.title}</span>
    <span className="lab-cover-imprint">TAIYOU STUDIO · SAMPLE</span>
  </div>;
}

export function ReadButton({ book, read, label }: {
  book: LabBook; read: ConceptProps['read']; label?: string;
}) {
  return <button type="button" className="lab-action" onClick={() => read(book)}>
    {label ?? (book.progress ? 'Continue reading' : 'Start reading')} <span aria-hidden="true">↗</span>
  </button>;
}

export function ProgressLine({ book }: { book: LabBook }) {
  return <div className="lab-progress-track" aria-label={book.progress + '% read'}>
    <span style={{ width: book.progress + '%' }} />
  </div>;
}

export function StatusPill({ book }: { book: LabBook }) {
  return <span className="lab-status-pill">
    {book.trying ? 'Trying out' : book.progress ? book.progress + '% read' : 'Not started'}
  </span>;
}

export function LabSearch({ value, change, placeholder = 'Find a novel or tag…' }: {
  value: string; change: (value: string) => void; placeholder?: string;
}) {
  return <label className="lab-search"><span aria-hidden="true">⌕</span>
    <span className="lab-sr-only">Search fictional novels</span>
    <input aria-label="Search fictional novels" value={value}
      placeholder={placeholder} onChange={event => change(event.target.value)} />
  </label>;
}

export function FilterStrip({ selected, change }: {
  selected: LabFilter; change: (value: LabFilter) => void;
}) {
  const options: { value: LabFilter; label: string }[] = [
    { value: 'all', label: 'All books' },
    { value: 'reading', label: 'Reading' },
    { value: 'trying', label: 'Trying out' },
    { value: 'unread', label: 'Unstarted' },
  ];
  return <div className="lab-filter-strip" role="group" aria-label="Sample novel filter">
    {options.map(item => <button key={item.value} type="button"
      aria-pressed={selected === item.value}
      className={selected === item.value ? 'active' : ''}
      onClick={() => change(item.value)}>{item.label}</button>)}
  </div>;
}

export function LayoutDetail({ book, select, read, styleName = '' }: {
  book: LabBook; select: ConceptProps['select']; read: ConceptProps['read']; styleName?: string;
}) {
  return <section className={'lab-book-detail ' + styleName} aria-label={'Details for ' + book.title}>
    <button className="lab-detail-back" type="button" onClick={() => select(null)}>
      ← Return to collection
    </button>
    <div className="lab-detail-body">
      <BookCover book={book} variant="lab-detail-cover" />
      <div className="lab-detail-copy">
        <span className="lab-kicker">NOVEL · FICTIONAL SAMPLE</span>
        <h2>{book.title}</h2>
        <p className="lab-byline">{book.author}</p>
        <div className="lab-detail-meta"><StatusPill book={book} />
          <span>{book.chapters} sample chapters</span>
          {book.rating && <span>★ {book.rating}/10</span>}
        </div>
        <p className="lab-description">{book.description}</p>
        <div className="lab-tags">{book.tags.map(tag => <span key={tag}>{tag}</span>)}</div>
        <ProgressLine book={book} />
        <div className="lab-detail-actions">
          <ReadButton book={book} read={read} />
          <a className="lab-secondary-link" href={'/book/' + book.id}>
            Open in real novel details ↗
          </a>
        </div>
        <p className="lab-disclaimer">This layout is a comparison prototype. For real
          ratings, tags, chapter controls and deletion safeguards, use the existing application.</p>
      </div>
    </div>
  </section>;
}
