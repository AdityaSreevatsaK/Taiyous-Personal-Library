import type { LibraryBook } from '../types';
import type { BookCollection } from './collections';
import { bookTags, tagCounts } from './tags';

export interface HomeBookSelection {
  featured: LibraryBook | undefined;
  continueReading: LibraryBook[];
  journal: LibraryBook[];
}

export interface HomeShelf {
  kind: 'collection' | 'tag';
  id: string;
  name: string;
  count: number;
  preview: LibraryBook;
}

const titleOrder = (a: LibraryBook, b: LibraryBook) =>
  a.title.localeCompare(b.title, undefined, { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id);

function activity(book: LibraryBook): number {
  return Math.max(book.lastOpenedAt || 0, book.progressUpdatedAt || 0, book.importedAt || 0);
}

const recentFirst = (a: LibraryBook, b: LibraryBook) => activity(b) - activity(a) || titleOrder(a, b);

/**
 * A small, deterministic home selection from existing private catalogue data.
 * Reading recency determines the hero; trials, personal ratings and recent
 * imports inform the journal. No external recommendations or network calls.
 */
export function selectHomeBooks(books: readonly LibraryBook[]): HomeBookSelection {
  const active = books.filter(book => book.shelfStatus !== 'trying' && book.progress > 0 && book.progress < 99.5)
    .sort((a, b) => (b.lastOpenedAt || b.progressUpdatedAt || 0) -
      (a.lastOpenedAt || a.progressUpdatedAt || 0) || recentFirst(a, b));
  const featured = active[0] ||
    [...books].filter(book => book.shelfStatus !== 'trying').sort(recentFirst)[0] ||
    [...books].sort(recentFirst)[0];
  const continueReading = active.filter(book => book.id !== featured?.id).slice(0, 3);
  const used = new Set([featured?.id, ...continueReading.map(book => book.id)]);
  const score = (book: LibraryBook) => {
    if (book.shelfStatus === 'trying') return 50;
    if ((book.personalRating || 0) >= 8) return 40 + (book.personalRating || 0);
    if (book.progress >= 99.5) return 30;
    if (book.progress === 0) return 20;
    return 10;
  };
  const journal = books.filter(book => !used.has(book.id)).sort((a, b) =>
    score(b) - score(a) || recentFirst(a, b)).slice(0, 6);
  // A one-book library should still show a real entry rather than a blank journal.
  if (journal.length === 0 && featured) journal.push(featured);
  return { featured, continueReading, journal };
}

/**
 * Prefer the owner's non-empty collections, then real catalogue tags.
 * Blank/deleted collections and empty tag groups never create fake shelves.
 * Cards are navigable into the existing scoped catalogue routes.
 */
export function selectHomeShelves(
  books: readonly LibraryBook[], collections: readonly BookCollection[], limit = 4,
): HomeShelf[] {
  if (!books.length || limit < 1) return [];
  const byId = new Map(books.map(book => [book.id, book]));
  const shelves: HomeShelf[] = [];
  for (const collection of [...collections].filter(item => !item.deleted).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const members = collection.bookIds.map(id => byId.get(id)).filter((book): book is LibraryBook => !!book);
    if (!members.length) continue;
    members.sort(recentFirst);
    shelves.push({ kind: 'collection', id: collection.id, name: collection.name,
      count: members.length, preview: members[0] });
    if (shelves.length === limit) return shelves;
  }
  for (const { tag } of tagCounts([...books])) {
    const members = books.filter(book => bookTags(book).some(value =>
      value.toLocaleLowerCase() === tag.toLocaleLowerCase())).sort(recentFirst);
    if (!members.length) continue;
    shelves.push({ kind: 'tag', id: tag, name: tag, count: members.length, preview: members[0] });
    if (shelves.length === limit) break;
  }
  return shelves;
}
