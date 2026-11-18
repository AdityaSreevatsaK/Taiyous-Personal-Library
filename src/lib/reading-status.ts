import type { LibraryBook } from '../types';
import { normalisePublicationStatus } from './publication-status';

/** Serialised novels may be caught up at 100% without being finished. */
export function isOngoingNovel(book: Pick<LibraryBook, 'status'>): boolean {
  // Historical exported name kept for cloud-sync compatibility. This
  // includes paused/abandoned publications, none of which are completed.
  const status = normalisePublicationStatus(book.status);
  return status === 'Ongoing' || status === 'Hiatus' || status === 'Dropped';
}

/** Finishing a novel is a durable status, not its current reading cursor. */
export function isFinished(book: Pick<LibraryBook, 'status' | 'progress' | 'completedAt'>): boolean {
  // Explicit ongoing status takes precedence over older auto-completion flags.
  // Keep the original flag intact: no personal metadata is deleted or migrated.
  if (isOngoingNovel(book)) return false;
  return (typeof book.completedAt === 'number' && book.completedAt > 0) || book.progress >= 99.5;
}

export function isCurrentlyReading(book: LibraryBook): boolean {
  return book.shelfStatus !== 'trying' && !isFinished(book) && book.progress > 0;
}

/** A 100% position in an ongoing novel means all available chapters are read. */
export function readingProgressLabel(book: Pick<LibraryBook, 'status' | 'progress' | 'completedAt' | 'chapterCount' | 'currentChapterNumber'>): string {
  if (isOngoingNovel(book) && book.progress >= 99.5) {
    // A newer EPUB may contain more chapters than were available when the
    // saved position reached 100%. Never call such a position "Caught up".
    if (book.chapterCount && book.currentChapterNumber &&
        book.currentChapterNumber < book.chapterCount) return 'New chapters available';
    return normalisePublicationStatus(book.status) === 'Dropped'
      ? 'All available chapters read' : 'Caught up';
  }
  if (isFinished(book)) return 'Finished';
  return book.progress > 0 ? 'Currently reading' : 'Not started';
}

/** Capture earlier 100% status before a new reading position overwrites it. */
export function withUpdatedReadingPosition(book: LibraryBook, patch: Partial<LibraryBook>, now = Date.now()): LibraryBook {
  const updatedAt = Math.max(now, (book.progressUpdatedAt || 0) + 1);
  const completedAt = isOngoingNovel(book) ? book.completedAt : (
    book.completedAt ||
    (book.progress >= 99.5 ? (book.progressUpdatedAt || updatedAt) : undefined) ||
    (typeof patch.progress === 'number' && patch.progress >= 99.5 ? updatedAt : undefined)
  );
  return {
    ...book, ...patch, completedAt, progressUpdatedAt: updatedAt,
    pendingProgressSync: !!book.cloud,
  };
}
