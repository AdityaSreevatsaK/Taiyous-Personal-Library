import { describe, expect, it } from 'vitest';
import { bookTags, includesTag, normalizeTags, tagCounts } from '../src/lib/tags';
import type { LibraryBook } from '../src/types';

function novel(id: string, sourceTags: string[], personalTags: string[]): LibraryBook {
  return {
    id, title: 'A novel', author: 'Someone', originalFileName: `${id}.epub`,
    importedAt: 1, progress: 0, size: 100, sourceTags, personalTags,
  };
}

describe('tag and genre organisation', () => {
  it('normalises and de-duplicates case-insensitively', () => {
    expect(normalizeTags(['  Romance  ', 'romance', ' Kingdom  Building ', '', 'Sci-Fi'])).toEqual([
      'Romance', 'Kingdom Building', 'Sci-Fi',
    ]);
  });
  it('merges original genres with personal tags without duplicates', () => {
    const book = novel('first', ['Romance', 'Fantasy'], ['Favourite', 'romance']);
    expect(bookTags(book)).toEqual(['Romance', 'Fantasy', 'Favourite']);
    expect(includesTag(book, 'FANTASY')).toBe(true);
    expect(includesTag(book, 'Cultivation')).toBe(false);
  });
  it('counts distinct matching tags across books', () => {
    expect(tagCounts([
      novel('one', ['Romance'], ['Favourite']),
      novel('two', ['romance', 'Fantasy'], ['favourite']),
    ])).toEqual([
      { tag: 'Favourite', count: 2 }, { tag: 'Romance', count: 2 }, { tag: 'Fantasy', count: 1 },
    ]);
  });
  it('supports old imports with no tags', () => {
    expect(bookTags(novel('old', [], []))).toEqual([]);
    expect(bookTags({})).toEqual([]);
  });
});
