import type { LibraryBook } from '../types';

/** When a long private-cloud refresh completes, newer in-reader edits may have
 * happened since the catalogue snapshot. Do not replace those edits with the
 * stale snapshot, or resurrect a locally deleted entry. This is local safety,
 * not a substitute for revision-safe multi-device sync (Issue #34).
 */
export function reconcileCompletedCloudRefresh(
  initial: readonly LibraryBook[], refreshed: readonly LibraryBook[], live: readonly LibraryBook[],
): LibraryBook[] {
  const initialIds = new Set(initial.map(book => book.id));
  const liveById = new Map(live.map(book => [book.id, book]));
  const readingFields = [
    'progress', 'completedAt', 'currentChapter', 'currentChapterIndex',
    'currentChapterNumber', 'lastCfi', 'lastOpenedAt', 'progressUpdatedAt',
    'pendingProgressSync',
  ] as const;
  const reviewFields = [
    'personalRating', 'personalReview', 'personalReviewUpdatedAt',
    'pendingReviewSync', 'shelfStatus',
  ] as const;

  const checked = refreshed.flatMap(book => {
    const current = liveById.get(book.id);
    // An in-progress local deletion must not be undone by an older refresh.
    if (!current) return [];
    const merged: LibraryBook = {
      ...book,
      // Personal-only fields are never supplied by the authoritative HF
      // catalogue and may be edited while remote notes are loading.
      personalTags: current.personalTags,
      userDescription: current.userDescription,
    };
    const currentPosition = current.progressUpdatedAt ?? current.lastOpenedAt ?? 0;
    const snapshotPosition = book.progressUpdatedAt ?? book.lastOpenedAt ?? 0;
    if (currentPosition > snapshotPosition ||
        (current.pendingProgressSync && currentPosition >= snapshotPosition)) {
      for (const field of readingFields) {
        // Avoid Object.assign from old book: only personal position fields.
        (merged as unknown as Record<string, unknown>)[field] = current[field];
      }
    }
    const currentReview = current.personalReviewUpdatedAt || 0;
    const snapshotReview = book.personalReviewUpdatedAt || 0;
    if (currentReview > snapshotReview ||
        (current.pendingReviewSync && currentReview >= snapshotReview)) {
      for (const field of reviewFields) {
        (merged as unknown as Record<string, unknown>)[field] = current[field];
      }
    }
    return [merged];
  });
  // New books imported/added while the remote scan ran must stay visible.
  return [...checked, ...live.filter(book => !initialIds.has(book.id))];
}
