import { describe, expect, it } from 'vitest';
import {
  parseLibraryRoute, novelUrl, namedNovelUrl, novelSlug,
  resolveNovelRoute, slugifyNovelTitle,
} from './routes';

const id = '0123456789abcdef01234567';
const second = 'fedcba9876543210fedcba98';
const emperor = { id, title: "Emperor's Domination" };
const martial = { id: second, title: 'Martial World' };

describe('readable novel URLs', () => {
  it('uses novel titles instead of opaque IDs for details and reading', () => {
    const books = [emperor, martial];
    expect(namedNovelUrl(emperor, books)).toBe('/novels/emperors-domination');
    expect(namedNovelUrl(emperor, books, true)).toBe('/novels/emperors-domination/read');
    expect(parseLibraryRoute(namedNovelUrl(emperor, books))).toEqual({
      page: 'details', slug: 'emperors-domination',
    });
    expect(parseLibraryRoute(namedNovelUrl(emperor, books, true))).toEqual({
      page: 'reader', slug: 'emperors-domination',
    });
    expect(resolveNovelRoute(parseLibraryRoute('/novels/emperors-domination'), books)).toEqual(emperor);
    expect(resolveNovelRoute(parseLibraryRoute('/novels/emperors-domination/read/'), books)).toEqual(emperor);
  });

  it('keeps old ID bookmarks functional so they can be canonicalised', () => {
    const books = [emperor, martial];
    expect(parseLibraryRoute(novelUrl(id))).toEqual({ page: 'details', id });
    expect(parseLibraryRoute(novelUrl(id, true))).toEqual({ page: 'reader', id });
    expect(resolveNovelRoute(parseLibraryRoute(novelUrl(id, true)), books)).toEqual(emperor);
    expect(namedNovelUrl(emperor, books, true)).not.toContain(id);
    expect(() => novelUrl('bad-id')).toThrow();
  });

  it('disambiguates duplicate titles deterministically without picking the wrong book', () => {
    const books = [
      emperor,
      { id: second, title: "Emperor’s Domination" },
    ];
    const first = namedNovelUrl(books[0], books);
    const other = namedNovelUrl(books[1], books);
    expect(first).toBe('/novels/emperors-domination-01234567');
    expect(other).toBe('/novels/emperors-domination-fedcba98');
    expect(first).not.toBe(other);
    expect(resolveNovelRoute(parseLibraryRoute(first), books)).toEqual(books[0]);
    expect(resolveNovelRoute(parseLibraryRoute(other), books)).toEqual(books[1]);
    expect(resolveNovelRoute(parseLibraryRoute('/novels/emperors-domination'), books)).toBeNull();
    expect(namedNovelUrl(books[0], [...books].reverse())).toBe(first);
  });

  it('extends the collision suffix if titles or IDs would produce a conflicting slug', () => {
    const a = { id: 'aaaaaaaa1111111111111111', title: 'A Tale' };
    const b = { id: 'aaaaaaaa2222222222222222', title: 'A Tale' };
    const c = { id: 'bbbbbbbb1111111111111111', title: 'A Tale aaaaaaaa1111' };
    const books = [a, b, c];
    expect(novelSlug(a, books)).toBe('a-tale-aaaaaaaa11111111');
    expect(novelSlug(b, books)).toBe('a-tale-aaaaaaaa2222');
    expect(namedNovelUrl(c, books)).toBe('/novels/a-tale-aaaaaaaa1111');
  });

  it('handles unicode and punctuation, with valid bookmarkable encoding', () => {
    const book = { id, title: '修仙：The Path / Résumé!' };
    const url = namedNovelUrl(book, [book]);
    expect(url.startsWith('/novels/%E4%BF%AE')).toBe(true);
    expect(url.endsWith('-the-path-resume')).toBe(true);
    expect(resolveNovelRoute(parseLibraryRoute(url), [book])).toEqual(book);
    expect(slugifyNovelTitle("  Emperor's Domination  ")).toBe('emperors-domination');
  });

  it('does not accept malicious, malformed or arbitrary routes as novel pages', () => {
    const invalid = [
      '/api/oauth/login', '/book/../../secrets',
      '/novels/../read', '/novels/%2Fetc', '/novels/%E0%A4%A',
      '/novels/emperors-domination/other', '/novels/UPPER-CASE',
      '/novels/evil%3Fquery', '/novels/bad--slug',
    ];
    for (const path of invalid) {
      expect(parseLibraryRoute(path)).toEqual({ page: 'library' });
    }
    expect(resolveNovelRoute(parseLibraryRoute('/novels/not-found'), [emperor])).toBeNull();
    expect(parseLibraryRoute('/')).toEqual({ page: 'library' });
    expect(() => namedNovelUrl({ id: 'bad', title: 'Book' }, [])).toThrow();
  });

  it('retains a stable storage ID even if the display title changes', () => {
    const renamed = { ...emperor, title: 'A Different Emperor' };
    expect(namedNovelUrl(renamed, [renamed])).toBe('/novels/a-different-emperor');
    expect(resolveNovelRoute(parseLibraryRoute(novelUrl(id)), [renamed])).toEqual(renamed);
  });
});
