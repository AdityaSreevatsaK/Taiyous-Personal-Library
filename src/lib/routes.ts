/** Bookmarkable novel routes. UUIDs stay internal; public-facing paths use titles. */
import type { LibraryBook } from '../types';

type NamedBook = Pick<LibraryBook, 'id' | 'title'>;
export type LibraryRoute =
  | { page: 'library' }
  | { page: 'details' | 'reader'; id: string }
  | { page: 'details' | 'reader'; slug: string };

const ID = '[0-9a-f]{24}';
const LEGACY_DETAILS = new RegExp('^/book/(' + ID + ')/?$');
const LEGACY_READER = new RegExp('^/book/(' + ID + ')/read/?$');
const NAMED_DETAILS = new RegExp('^/novels/([^/]+)/?$');
const NAMED_READER = new RegExp('^/novels/([^/]+)/read/?$');

/** Preserve non-Latin titles whilst removing punctuation and unsafe separators. */
export function slugifyNovelTitle(title: string): string {
  const text = title.normalize('NFKD').toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/g, '')
    .replace(/\p{M}/gu, '');
  const words = text.match(/[\p{L}\p{N}]+/gu);
  const slug = Array.from((words || ['untitled']).join('-')).slice(0, 96).join('').replace(/-+$/, '');
  return slug || 'untitled';
}

/**
 * Name-only URLs for distinct titles. Identical titles get short stable ID
 * suffixes to prevent opening the wrong book. All internal data still uses IDs.
 */
export function novelSlug(book: NamedBook, catalogue: readonly NamedBook[]): string {
  if (!new RegExp('^' + ID + '$').test(book.id)) throw new Error('Invalid novel identifier');
  const base = slugifyNovelTitle(book.title);
  const matches = catalogue.filter(other => slugifyNovelTitle(other.title) === base);
  if (matches.length <= 1) return base;

  const bases = new Set(catalogue.map(other => slugifyNovelTitle(other.title)));
  for (let digits = 8; digits <= 24; digits += 4) {
    const candidate = base + '-' + book.id.slice(0, digits);
    if (!bases.has(candidate) && matches.every(other =>
      other.id === book.id || other.id.slice(0, digits) !== book.id.slice(0, digits))) {
      return candidate;
    }
  }
  throw new Error('Unable to distinguish duplicate novel titles');
}

export function namedNovelUrl(
  book: NamedBook, catalogue: readonly NamedBook[], reader = false,
): string {
  return '/novels/' + encodeURIComponent(novelSlug(book, catalogue)) + (reader ? '/read' : '');
}

/** Existing ID-based bookmarks are intentionally supported as legacy aliases. */
export function novelUrl(id: string, reader = false): string {
  if (!new RegExp('^' + ID + '$').test(id)) throw new Error('Invalid novel identifier');
  return '/book/' + id + (reader ? '/read' : '');
}

function parseSlug(segment: string): string | null {
  try {
    const slug = decodeURIComponent(segment);
    if (slug.length > 160 || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) return null;
    if (slugifyNovelTitle(slug) !== slug) return null;
    return slug;
  } catch {
    return null;
  }
}

export function parseLibraryRoute(path: string): LibraryRoute {
  const legacyReader = LEGACY_READER.exec(path);
  if (legacyReader) return { page: 'reader', id: legacyReader[1] };
  const legacyDetails = LEGACY_DETAILS.exec(path);
  if (legacyDetails) return { page: 'details', id: legacyDetails[1] };
  const namedReader = NAMED_READER.exec(path);
  if (namedReader) {
    const slug = parseSlug(namedReader[1]);
    if (slug) return { page: 'reader', slug };
  }
  const namedDetails = NAMED_DETAILS.exec(path);
  if (namedDetails) {
    const slug = parseSlug(namedDetails[1]);
    if (slug) return { page: 'details', slug };
  }
  return { page: 'library' };
}

export function resolveNovelRoute(route: LibraryRoute, books: readonly NamedBook[]): NamedBook | null {
  if (route.page === 'library') return null;
  if ('id' in route) return books.find(book => book.id === route.id) || null;
  return books.find(book => novelSlug(book, books) === route.slug) || null;
}
