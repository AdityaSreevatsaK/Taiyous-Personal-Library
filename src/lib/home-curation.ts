import type { LibraryBook } from '../types';
import type { BookCollection } from './collections';
import { bookTags, tagCounts } from './tags';
import { isFinished, isCurrentlyReading } from './reading-status';

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

/** Seeded Fisher-Yates so one visit stays stable while subsequent visits vary. */
function shuffleForVisit<T>(items: readonly T[], seed: number): T[] {
  const result = [...items];
  let state = (seed >>> 0) ^ 0x9e3779b9;
  state ^= state >>> 16;
  state = Math.imul(state, 0x85ebca6b);
  state ^= state >>> 13;
  state = Math.imul(state, 0xc2b2ae35);
  state = (state ^ (state >>> 16)) >>> 0 || 1;
  for (let i = result.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Choose real, distinct covers; prefer novels other than the hero. */
export function selectHomeGalleryCovers(
  books: readonly LibraryBook[], featuredId: string | undefined, seed: number, limit = 12,
): LibraryBook[] {
  if (limit < 1) return [];
  const seen = new Set<string>();
  const covered = [...books].sort(titleOrder).filter(book => {
    if (!book.coverPath || seen.has(book.id)) return false;
    seen.add(book.id);
    return true;
  });
  const gallery = shuffleForVisit(covered.filter(book => book.id !== featuredId), seed);
  const featuredCover = covered.find(book => book.id === featuredId);
  if (featuredCover) gallery.push(featuredCover);
  return gallery.slice(0, limit);
}

/**
 * Curate a reading desk and journal from private catalogue data. A nonzero
 * visit seed randomises only the featured hero, never reading history, shelf
 * membership or the reading-desk order. No external recommendations.
 */
export function selectHomeBooks(books: readonly LibraryBook[], heroSeed = 0): HomeBookSelection {
  const active = books.filter(isCurrentlyReading)
    .sort((a, b) => (b.lastOpenedAt || b.progressUpdatedAt || 0) -
      (a.lastOpenedAt || a.progressUpdatedAt || 0) || recentFirst(a, b));
  const featured = heroSeed !== 0
    ? shuffleForVisit([...books].sort(titleOrder), heroSeed)[0]
    : active[0] ||
      [...books].filter(book => book.shelfStatus !== 'trying').sort(recentFirst)[0] ||
      [...books].sort(recentFirst)[0];
  // Include the featured novel too: the count and the reading desk must agree.
  // Do not arbitrarily omit active titles when there are more than three.
  const continueReading = active;
  const used = new Set([featured?.id, ...continueReading.map(book => book.id)]);
  const score = (book: LibraryBook) => {
    if (book.shelfStatus === 'trying') return 50;
    if ((book.personalRating || 0) >= 8) return 40 + (book.personalRating || 0);
    if (isFinished(book)) return 30;
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
 * Use a distinct novel for every preview. An augmenting-path assignment
 * permits an earlier shelf to change its cover when a later shelf has only
 * one possible novel. If distinct previews are impossible, show fewer cards
 * rather than repeating the same cover under multiple genres.
 *
 * Book IDs, not cover image URLs, determine identity; a title may have more
 * than one tag, but its preview appears at most once across these cards.
 */
export function selectHomeShelves(
  books: readonly LibraryBook[], collections: readonly BookCollection[], limit = 4, seed = 0,
): HomeShelf[] {
  if (!books.length || limit < 1) return [];
  type Candidate = Omit<HomeShelf, 'preview'> & { members: LibraryBook[] };
  const byId = new Map(books.map(book => [book.id, book]));
  const candidates: Candidate[] = [];

  for (const collection of [...collections].filter(item => !item.deleted).sort((a, b) =>
    a.name.localeCompare(b.name))) {
    const members = collection.bookIds.map(id => byId.get(id))
      .filter((book): book is LibraryBook => !!book).sort((a,b)=>Number(!!b.coverPath)-Number(!!a.coverPath) || recentFirst(a,b));
    if (members.length) candidates.push({
      kind: 'collection', id: collection.id, name: collection.name, count: members.length, members,
    });
  }

  for (const { tag } of tagCounts([...books])) {
    const members = books.filter(book => bookTags(book).some(value =>
      value.toLocaleLowerCase() === tag.toLocaleLowerCase())).sort((a,b)=>Number(!!b.coverPath)-Number(!!a.coverPath) || recentFirst(a,b));
    if (members.length) candidates.push({
      kind: 'tag', id: tag, name: tag, count: members.length, members,
    });
  }

  // Seed 0 preserves established deterministic behaviour for existing callers.
  // The homepage supplies one nonzero random seed per visit, not per render.
  if (seed !== 0) {
    let state = (seed >>> 0) || 1;
    const random = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    // Each chosen shelf also varies its cover without ever reusing the same
    // book as another shelf's preview (allocation below enforces uniqueness).
    for (const candidate of candidates) {
      for (let i = candidate.members.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [candidate.members[i], candidate.members[j]] = [candidate.members[j], candidate.members[i]];
      }
    }
  }

  const owners = new Map<string, number>();
  const previews = new Map<number, LibraryBook>();
  const selected: number[] = [];
  function allocate(index: number, visited: Set<string>): boolean {
    for (const book of candidates[index].members) {
      if (visited.has(book.id)) continue;
      visited.add(book.id);
      const owner = owners.get(book.id);
      if (owner === undefined || allocate(owner, visited)) {
        owners.set(book.id, index);
        previews.set(index, book);
        return true;
      }
    }
    return false;
  }

  for (let index = 0; index < candidates.length && selected.length < limit; index++) {
    if (allocate(index, new Set())) selected.push(index);
  }
  return selected.map(index => ({
    kind: candidates[index].kind,
    id: candidates[index].id,
    name: candidates[index].name,
    count: candidates[index].count,
    preview: previews.get(index)!,
  }));
}
