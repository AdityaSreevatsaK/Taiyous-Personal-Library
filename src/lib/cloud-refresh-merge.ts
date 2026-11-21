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
  const initialById = new Map(initial.map(book => [book.id, book]));
  const liveById = new Map(live.map(book => [book.id, book]));
  const readingFields = [
    'progress', 'completedAt', 'currentChapter', 'currentChapterIndex',
    'currentChapterNumber', 'lastCfi', 'lastOpenedAt', 'progressUpdatedAt',
    'pendingProgressSync', 'progressCloudRevision', 'progressSyncConflict',
  ] as const;
  const reviewFields = [
    'personalRating', 'personalReview', 'personalReviewUpdatedAt',
    'pendingReviewSync', 'shelfStatus', 'reviewCloudRevision', 'reviewSyncConflict',
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
    const previous = initialById.get(book.id);
    // On a long refresh, the most recent LOCAL edit wins regardless of another
    // device's wall clock. The remote revision is retained for explicit CAS.
    const localPositionChanged = previous !== undefined &&
      (current.progressUpdatedAt !== previous.progressUpdatedAt ||
       current.pendingProgressSync !== previous.pendingProgressSync ||
       current.progress !== previous.progress ||
       current.completedAt !== previous.completedAt);
    const localReviewChanged = previous !== undefined &&
      (current.personalReviewUpdatedAt !== previous.personalReviewUpdatedAt ||
       current.pendingReviewSync !== previous.pendingReviewSync ||
       current.personalRating !== previous.personalRating ||
       current.personalReview !== previous.personalReview ||
       current.shelfStatus !== previous.shelfStatus);
    const currentPosition = current.progressUpdatedAt ?? current.lastOpenedAt ?? 0;
    const snapshotPosition = book.progressUpdatedAt ?? book.lastOpenedAt ?? 0;
    if (localPositionChanged || currentPosition > snapshotPosition ||
        (current.pendingProgressSync && currentPosition >= snapshotPosition)) {
      for (const field of readingFields) {
        // Avoid Object.assign from an older book: only reading fields.
        (merged as unknown as Record<string, unknown>)[field] = current[field];
      }
      // Keep a freshly observed competing cloud revision alongside the newer
      // local position, so the user can compare both copies safely.
      if (book.progressSyncConflict) {
        merged.progressSyncConflict = book.progressSyncConflict;
        merged.pendingProgressSync = true;
      }
    }
    const currentReview = current.personalReviewUpdatedAt || 0;
    const snapshotReview = book.personalReviewUpdatedAt || 0;
    if (localReviewChanged || currentReview > snapshotReview ||
        (current.pendingReviewSync && currentReview >= snapshotReview)) {
      for (const field of reviewFields) {
        (merged as unknown as Record<string, unknown>)[field] = current[field];
      }
      if (book.reviewSyncConflict) {
        merged.reviewSyncConflict = book.reviewSyncConflict;
        merged.pendingReviewSync = true;
      }
    }
    return [merged];
  });
  // New books imported/added while the remote scan ran must stay visible.
  return [...checked, ...live.filter(book => !initialIds.has(book.id))];
}
