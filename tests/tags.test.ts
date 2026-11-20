import { describe, expect, it } from 'vitest';
import { alphabeticalBookTags, bookTags, includesTag, normalizeTags, tagCounts } from '../src/lib/tags';
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
  it('sorts imported genres and personal tags together, immediately and after saving', () => {
    const source = ['Fantasy', 'Slice of Life', 'Comedy', 'Fan-fic', 'Reincarnation'];
    const personal = ['Romance'];
    const original = novel('sorted', source, personal);
    expect(alphabeticalBookTags(original)).toEqual([
      'Comedy', 'Fan-fic', 'Fantasy', 'Reincarnation', 'Romance', 'Slice of Life',
    ]);
    // Adding a personal tag to the unsaved draft updates the displayed order.
    const draft = { ...original, personalTags: [...personal, 'Adventure'] };
    expect(alphabeticalBookTags(draft)).toEqual([
      'Adventure', 'Comedy', 'Fan-fic', 'Fantasy', 'Reincarnation', 'Romance', 'Slice of Life',
    ]);
    // The same merged order survives saving to the stored book metadata.
    const saved = { ...original, personalTags: [...personal, 'Adventure'] };
    expect(alphabeticalBookTags(saved)).toEqual(alphabeticalBookTags(draft));
    expect(source).toEqual(['Fantasy', 'Slice of Life', 'Comedy', 'Fan-fic', 'Reincarnation']);
    expect(original.personalTags).toEqual(['Romance']);
    // Existing de-duplication ignores case without hiding an imported tag.
    expect(alphabeticalBookTags({
      sourceTags: ['romance', 'Action', 'Fantasy'],
      personalTags: ['ROMANCE', 'action', 'zebra', 'apple'],
    })).toEqual(['Action', 'apple', 'Fantasy', 'romance', 'zebra']);
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

describe('library-wide personal tag suggestions', () => {
  it('creates Title Case tags and reuses established labels case-insensitively', async () => {
    const { normalisePersonalTags } = await import('../src/lib/tags');
    expect(normalisePersonalTags(['sLoW bUrN', 'SCI-FI', 'slow burn'], ['Slow Burn', 'Sci-Fi']))
      .toEqual(['Slow Burn', 'Sci-Fi']);
    expect(normalisePersonalTags('original character, ROMANCE')).toEqual(['Original Character', 'Romance']);
  });
  it('suggests existing tags for case, prefixes and likely typos', async () => {
    const { suggestExistingTags } = await import('../src/lib/tags');
    expect(suggestExistingTags('rom', ['Romance', 'Adventure', 'romance'])).toEqual(['Romance']);
    expect(suggestExistingTags('ROMANCE', ['Romance'])).toEqual(['Romance']);
    expect(suggestExistingTags('romnace', ['Romance'])).toEqual(['Romance']);
    expect(suggestExistingTags('adv', ['Adventure'])).toEqual(['Adventure']);
  });
});
