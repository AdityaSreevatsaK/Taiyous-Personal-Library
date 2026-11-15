import type { LibraryBook } from '../types';

/** Reset only the reader position for one immutable novel ID.
 * Preserve EPUB, notes, tags, ratings, imported metadata and collections.
 * Move the revision forward even during rapid consecutive writes, so an
 * older cloud position cannot silently resurrect the previous chapter.
 */
export function resetReadingProgress(book: LibraryBook, now = Date.now()): LibraryBook {
  const updatedAt = Math.max(now, (book.progressUpdatedAt || 0) + 1);
  return {
    ...book,
    progress: 0,
    currentChapter: undefined,
    currentChapterIndex: undefined,
    currentChapterNumber: undefined,
    lastCfi: undefined,
    lastOpenedAt: undefined,
    progressUpdatedAt: updatedAt,
    pendingProgressSync: !!book.cloud,
  };
}
