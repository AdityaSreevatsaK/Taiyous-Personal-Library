import type { LibraryBook } from '../types';

/**
 * Obtain EPUB bytes solely for immediate reading/export. Reading cannot
 * create an offline IndexedDB entry as no persistence callback is supplied.
 * Direct imports and explicitly requested offline saves remain separate.
 */
export async function readEpubWithoutCaching(
  book: Pick<LibraryBook, 'id' | 'cloud'>,
  localRead: (id: string) => Promise<Blob>,
  hostedRead: () => Promise<Blob>,
): Promise<Blob> {
  try {
    return await localRead(book.id);
  } catch (reason) {
    // Local-only imports have no verified hosted backup. Never invent one.
    if (!book.cloud) throw reason;
  }
  return hostedRead();
}
