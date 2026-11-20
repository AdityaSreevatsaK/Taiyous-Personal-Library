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

/** A–Z display for both protected imported genres and editable personal tags.
 * Sort only the merged display list; do not rewrite the original metadata or
 * reorder personal tags stored in the cloud. */
export function alphabeticalBookTags(book: Pick<LibraryBook, 'sourceTags' | 'personalTags'>): string[] {
  return bookTags(book).sort((a, b) => a.localeCompare(b, undefined, {
    sensitivity: 'base', numeric: true,
  }) || a.localeCompare(b));
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

/** Unicode-aware case-insensitive comparison across imported and personal tags. */
export function tagKey(tag: string): string {
  return tag.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

/** Title Case for new personal labels; stored imported metadata is untouched. */
export function titleCaseTag(label: string): string {
  return label.normalize('NFKC').replace(/\s+/g, ' ').trim().slice(0, 45)
    .toLocaleLowerCase().replace(/(^|[\s\-/])(\p{L})/gu,
      (_match: string, separator: string, letter: string) => separator + letter.toLocaleUpperCase());
}

/** Return existing library labels when possible, never duplicate by casing. */
export function normalisePersonalTags(values: unknown, knownTags: readonly string[] = []): string[] {
  const known = new Map(knownTags.map(label => [tagKey(label), titleCaseTag(label)]));
  return normalizeTags(values).map(label => known.get(tagKey(label)) || titleCaseTag(label));
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/** Partial and typo-tolerant existing-tag suggestions, sorted by relevance. */
export function suggestExistingTags(query: string, knownTags: readonly string[], limit = 6): string[] {
  const searched = tagKey(query);
  if (!searched) return [];
  const candidates = new Map<string, string>();
  for (const label of knownTags) if (!candidates.has(tagKey(label))) {
    candidates.set(tagKey(label), titleCaseTag(label));
  }
  return [...candidates.entries()].map(([key, label]) => ({
    label, score: key === searched ? 0 : key.startsWith(searched) ? 1 :
      key.includes(searched) ? 2 :
      searched.length >= 4 && Math.abs(key.length - searched.length) <= 2 &&
      editDistance(key, searched) <= 2 ? 3 : 99,
  })).filter(item => item.score < 99)
    .sort((a, b) => a.score - b.score || a.label.localeCompare(b.label))
    .slice(0, limit).map(item => item.label);
}
