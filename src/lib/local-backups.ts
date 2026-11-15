import type { LibraryBook } from '../types';

/** A local-only EPUB can represent the same title as a hosted novel but have a
 * different immutable hash ID (for example, an older importer revision).
 * Never delete, overwrite or silently relink the original EPUB or progress.
 * Instead keep its full record accessible in a small local-backups section.
 * A remote title/author pair must be unique before we suppress a duplicate
 * from the primary bookshelves; genuine alternate editions remain visible.
 */
const key = (book: Pick<LibraryBook, 'title' | 'author'>): string | null => {
  const title = book.title.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const author = book.author.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  return title && author && author !== 'unknown' ? JSON.stringify([title, author]) : null;
};

export interface PartitionedLibrary {
  library: LibraryBook[];
  localBackups: LibraryBook[];
}

export function partitionLocalBackups(books: readonly LibraryBook[]): PartitionedLibrary {
  const hosted = new Map<string, Set<string>>();
  for (const book of books) {
    const k = key(book);
    if (!book.cloud || !k) continue;
    const ids = hosted.get(k) || new Set<string>();
    ids.add(book.id);
    hosted.set(k, ids);
  }
  const library: LibraryBook[] = [];
  const localBackups: LibraryBook[] = [];
  for (const book of books) {
    const k = key(book);
    // Only hide a local alias if exactly one independent hosted record matches.
    // Two hosted books with the same title are ambiguous and never collapsed.
    if (!book.cloud && k && hosted.get(k)?.size === 1) localBackups.push(book);
    else library.push(book);
  }
  return { library, localBackups };
}
