import { describe, expect, it } from 'vitest';
import { selectHomeBooks, selectHomeGalleryCovers, selectHomeShelves } from '../src/lib/home-curation';
import type { LibraryBook } from '../src/types';

const book = (n: number, extra: Partial<LibraryBook> = {}): LibraryBook => ({
  id: n.toString(16).padStart(24, '0'), title: 'Novel ' + n, author: 'Writer',
  originalFileName: 'novel.epub', importedAt: n * 100, progress: 0, size: 1,
  ...extra,
});

describe('curated private library homepage', () => {
  it('features the most recent novel and lists all active books consistently', () => {
    const books = [
      book(1, { progress: 30, lastOpenedAt: 1000 }),
      book(2, { progress: 60, lastOpenedAt: 2000 }),
      book(3, { progress: 4, lastOpenedAt: 1500 }),
      book(4, { shelfStatus: 'trying', lastOpenedAt: 9999 }),
      ...Array.from({ length: 20 }, (_, i) => book(i + 5)),
    ];
    const chosen = selectHomeBooks(books);
    expect(chosen.featured?.id).toBe(books[1].id);
    expect(chosen.continueReading.map(b => b.id)).toEqual([books[1].id, books[2].id, books[0].id]);
    expect(chosen.journal).toHaveLength(6);
    expect(chosen.journal[0].id).toBe(books[3].id);
    expect(new Set([chosen.featured!.id, ...chosen.continueReading.map(b => b.id),
      ...chosen.journal.map(b => b.id)]).size).toBe(9);
  });
  it('randomises the hero on each visit without changing the reading desk', () => {
    const novels = Array.from({ length: 30 }, (_, i) => book(i + 1, {
      coverPath: 'data/covers/' + i + '.jpg',
      ...(i % 3 === 0 ? { progress: 20, lastOpenedAt: 1000 + i } : {}),
    }));
    const results = Array.from({ length: 64 }, (_, i) => selectHomeBooks(novels, i + 1));
    expect(new Set(results.map(item => item.featured!.id)).size).toBeGreaterThan(10);
    expect(results.every(item => novels.includes(item.featured!))).toBe(true);
    for (const result of results) {
      expect(result.continueReading.map(item => item.id))
        .toEqual(results[0].continueReading.map(item => item.id));
      expect(new Set(result.journal.map(item => item.id)).size).toBe(result.journal.length);
      expect(result.journal.every(item => item.id !== result.featured?.id)).toBe(true);
    }
    expect(selectHomeBooks([...novels].reverse(), 15).featured?.id)
      .toBe(selectHomeBooks(novels, 15).featured?.id);
    expect(selectHomeBooks(novels, 15)).toEqual(selectHomeBooks(novels, 15));
  });

  it('shuffles the floating gallery and does not duplicate the featured cover when avoidable', () => {
    const novels = Array.from({ length: 26 }, (_, i) =>
      book(i + 1, { coverPath: 'data/novels/' + i + '/cover.jpg' }));
    const featuredId = novels[2].id;
    const samples = Array.from({ length: 32 }, (_, i) =>
      selectHomeGalleryCovers(novels, featuredId, i + 1));
    expect(new Set(samples.map(items => items.slice(0, 3).map(book => book.id).join('|'))).size)
      .toBeGreaterThan(12);
    for (const covers of samples) {
      expect(covers).toHaveLength(12);
      expect(new Set(covers.map(book => book.id)).size).toBe(12);
      expect(covers.every(book => !!book.coverPath && book.id !== featuredId)).toBe(true);
    }
    expect(selectHomeGalleryCovers([...novels].reverse(), featuredId, 42))
      .toEqual(selectHomeGalleryCovers(novels, featuredId, 42));
    expect(selectHomeGalleryCovers(novels, featuredId, 42))
      .toEqual(selectHomeGalleryCovers(novels, featuredId, 42));
    expect(selectHomeGalleryCovers([], featuredId, 42)).toEqual([]);
    expect(selectHomeGalleryCovers([book(1)], featuredId, 42)).toEqual([]);
    expect(selectHomeGalleryCovers([novels[2]], featuredId, 42)).toEqual([novels[2]]);
    expect(selectHomeGalleryCovers(novels, featuredId, 42, 0)).toEqual([]);
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
    expect(shelves.map(s => s.name)).toEqual(['Series', 'Cultivation']);
    expect(new Set(shelves.map(s => s.preview.id)).size).toBe(shelves.length);
    expect(shelves[0]).toMatchObject({ kind: 'collection', count: 1, preview: books[1] });
    expect(shelves[1]).toMatchObject({ kind: 'tag', count: 2 });
  });
  it('reassigns an earlier genre preview when a later genre only has that book', () => {
    const shared = book(1, { lastOpenedAt: 2000, sourceTags: ['Action', 'Fantasy'] });
    const alternative = book(2, { lastOpenedAt: 1000, sourceTags: ['Action'] });
    const shelves = selectHomeShelves([shared, alternative], []);
    expect(shelves.map(s => s.name)).toEqual(['Action', 'Fantasy']);
    expect(shelves.map(s => s.preview.id)).toEqual([alternative.id, shared.id]);
  });
  it('uses four distinct covers even when all four genres share the same titles', () => {
    const tags = ['Action', 'Adventure', 'Fantasy', 'Martial Arts'];
    const books = Array.from({ length: 6 }, (_, i) =>
      book(i + 1, { sourceTags: tags, lastOpenedAt: 600 - i }));
    const shelves = selectHomeShelves(books, []);
    expect(shelves).toHaveLength(4);
    expect(new Set(shelves.map(s => s.preview.id)).size).toBe(4);
    expect(shelves.map(s => s.count)).toEqual([6, 6, 6, 6]);
    expect(selectHomeShelves(books, [])).toEqual(shelves);
  });
  it('randomises just the four homepage shelf previews without losing links or reusing covers', () => {
    const tags = ['Fantasy', 'Action', 'Adventure', 'Cultivation', 'Romance', 'Drama', 'Sci-Fi', 'Mystery'];
    const novels = Array.from({ length: 15 }, (_, i) =>
      book(i + 1, { sourceTags: tags, coverPath: 'cover-' + i + '.jpg' }));
    const results = Array.from({ length: 32 }, (_, index) =>
      selectHomeShelves(novels, [], 4, index + 1));
    expect(new Set(results.map(items => items.map(item => item.id).join('|'))).size).toBeGreaterThan(1);
    for (const shelves of results) {
      expect(shelves).toHaveLength(4);
      expect(new Set(shelves.map(item => item.preview.id)).size).toBe(4);
      expect(shelves.every(item => tags.includes(item.name) && item.count === 15)).toBe(true);
    }
    expect(selectHomeShelves(novels, [], 4, 7)).toEqual(selectHomeShelves(novels, [], 4, 7));
    expect(selectHomeShelves(novels, [], 4, 7)).not.toEqual(selectHomeShelves(novels, [], 4, 18));
  });
  it('shows fewer shelf cards rather than reusing a cover with insufficient unique books', () => {
    const only = book(1, { sourceTags: ['Action', 'Fantasy', 'Martial Arts'] });
    const shelves = selectHomeShelves([only], []);
    expect(shelves).toHaveLength(1);
    expect(shelves[0]).toMatchObject({ name: 'Action', count: 1, preview: only });
  });
  it('caps shelves and remains safe with no genres or empty catalogue', () => {
    expect(selectHomeShelves([], [])).toEqual([]);
    expect(selectHomeShelves([book(1)], [])).toEqual([]);
    expect(selectHomeShelves([book(1, { personalTags: ['Adventure', 'Fantasy', 'Progression'] })], [], 2))
      .toHaveLength(1);
  });
});
