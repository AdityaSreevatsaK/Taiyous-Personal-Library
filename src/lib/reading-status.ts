import type { LibraryBook } from '../types';
/** Finishing a novel is a durable status, not its current reading cursor. */
export function isFinished(book: Pick<LibraryBook, 'progress' | 'completedAt'>): boolean {
  return (typeof book.completedAt === 'number' && book.completedAt > 0) || book.progress >= 99.5;
}
export function isCurrentlyReading(book: LibraryBook): boolean {
  return book.shelfStatus !== 'trying' && !isFinished(book) && book.progress > 0;
}
/** Capture earlier 100% status before a new reading position overwrites it. */
export function withUpdatedReadingPosition(book: LibraryBook, patch: Partial<LibraryBook>, now = Date.now()): LibraryBook {
  const updatedAt = Math.max(now, (book.progressUpdatedAt || 0) + 1);
  const completedAt = book.completedAt ||
    (book.progress >= 99.5 ? (book.progressUpdatedAt || updatedAt) : undefined) ||
    (typeof patch.progress === 'number' && patch.progress >= 99.5 ? updatedAt : undefined);
  return {
    ...book, ...patch, completedAt, progressUpdatedAt: updatedAt,
    pendingProgressSync: !!book.cloud,
  };
}
