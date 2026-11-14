import { describe, expect, it } from 'vitest';
import { selectHomeBooks, selectHomeShelves } from '../src/lib/home-curation';
import type { LibraryBook } from '../src/types';

const book = (n: number, extra: Partial<LibraryBook> = {}): LibraryBook => ({
  id: n.toString(16).padStart(24, '0'), title: 'Novel ' + n, author: 'Writer',
  originalFileName: 'novel.epub', importedAt: n * 100, progress: 0, size: 1,
  ...extra,
});

describe('curated private library homepage', () => {
  it('features the most recently read regular novel and does not repeat it in other lists', () => {
    const books = [
      book(1, { progress: 30, lastOpenedAt: 1000 }),
      book(2, { progress: 60, lastOpenedAt: 2000 }),
      book(3, { progress: 4, lastOpenedAt: 1500 }),
      book(4, { shelfStatus: 'trying', lastOpenedAt: 9999 }),
      ...Array.from({ length: 20 }, (_, i) => book(i + 5)),
    ];
    const chosen = selectHomeBooks(books);
    expect(chosen.featured?.id).toBe(books[1].id);
    expect(chosen.continueReading.map(b => b.id)).toEqual([books[2].id, books[0].id]);
    expect(chosen.journal).toHaveLength(6);
    expect(chosen.journal[0].id).toBe(books[3].id);
    expect(new Set([chosen.featured!.id, ...chosen.continueReading.map(b => b.id),
      ...chosen.journal.map(b => b.id)]).size).toBe(9);
  });
  it('handles empty and one-novel libraries gracefully', () => {
    expect(selectHomeBooks([])).toEqual({ featured: undefined, continueReading: [], journal: [] });
    const only = book(1);
    expect(selectHomeBooks([only])).toMatchObject({ featured: only, continueReading: [], journal: [only] });
  });
  it('favours high ratings over otherwise unordered unread books', () => {
    const books = [book(1), book(2, { personalRating: 10 }), book(3), book(4)];
    expect(selectHomeBooks(books).journal[0].id).toBe(books[1].id);
  });
  it('shows meaningful non-empty collections before tags, without invented data', () => {
    const books = [book(1, { sourceTags: ['Cultivation'] }), book(2, { sourceTags: ['Cultivation', 'Romance'] })];
    const collections = [
      { id: 'missing-collection', name: 'Empty', bookIds: [], updatedAt: 1 },
      { id: 'reading-series', name: 'Series', bookIds: [books[1].id], updatedAt: 1 },
      { id: 'deleted-group', name: 'Deleted', bookIds: [books[0].id], updatedAt: 1, deleted: true },
    ];
    const shelves = selectHomeShelves(books, collections);
    expect(shelves.map(s => s.name)).toEqual(['Series', 'Cultivation', 'Romance']);
    expect(shelves[0]).toMatchObject({ kind: 'collection', count: 1, preview: books[1] });
    expect(shelves[1]).toMatchObject({ kind: 'tag', count: 2 });
  });
  it('caps shelves and remains safe with no genres or empty catalogue', () => {
    expect(selectHomeShelves([], [])).toEqual([]);
    expect(selectHomeShelves([book(1)], [])).toEqual([]);
    expect(selectHomeShelves([book(1, { personalTags: ['Adventure', 'Fantasy', 'Progression'] })], [], 2))
      .toHaveLength(2);
  });
});
