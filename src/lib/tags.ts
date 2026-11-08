import type { LibraryBook } from '../types';

/** Trim, preserve displayed capitalization, and de-duplicate ignoring case. */
export function normalizeTags(values: unknown, max = 50): string[] {
  const raw: unknown[] = Array.isArray(values) ? values : typeof values === 'string' ? values.split(/[,;|]/) : [];
  const unique = new Set<string>();
  const result: string[] = [];
  for (const value of raw) {
    if (typeof value !== 'string') continue;
    const label = value.replace(/\s+/g, ' ').trim().slice(0, 45);
    const key = label.toLocaleLowerCase();
    if (!label || unique.has(key)) continue;
    unique.add(key);
    result.push(label);
    if (result.length >= max) break;
  }
  return result;
}

export function bookTags(book: Pick<LibraryBook, 'sourceTags' | 'personalTags'>): string[] {
  return normalizeTags([...(book.sourceTags || []), ...(book.personalTags || [])]);
}

export function includesTag(book: Pick<LibraryBook, 'sourceTags' | 'personalTags'>, tag: string): boolean {
  return bookTags(book).some((value) => value.toLocaleLowerCase() === tag.toLocaleLowerCase());
}

export function tagCounts(books: LibraryBook[]): { tag: string; count: number }[] {
  const counts = new Map<string, { tag: string; count: number }>();
  for (const book of books) {
    for (const tag of bookTags(book)) {
      const key = tag.toLocaleLowerCase();
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { tag, count: 1 });
    }
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
