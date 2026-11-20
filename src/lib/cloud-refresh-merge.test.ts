import { describe, expect, it } from 'vitest';
import type { LibraryBook } from '../types';
import { reconcileCompletedCloudRefresh } from './cloud-refresh-merge';

const id = 'a'.repeat(24), addedId = 'b'.repeat(24);
const book: LibraryBook = {
  id, title: 'Source Title', author: 'Author', originalFileName: 'novel.epub',
  importedAt: 1, size: 1234, progress: 10,
  progressUpdatedAt: 100, lastOpenedAt: 100,
  personalRating: 7, personalReview: 'Older review', personalReviewUpdatedAt: 100,
  personalTags: ['First'], userDescription: 'Original note', cloud: true,
};

describe('cloud refresh cannot clobber live reading and annotations', () => {
  it('preserves current progress, pending writes, tags and review changes', () => {
    const remote = { ...book, title: 'Updated source title', progress: 15,
      progressUpdatedAt: 200, pendingProgressSync: false, personalRating: 8,
      personalReview: 'Synced review', personalReviewUpdatedAt: 200, pendingReviewSync: false };
    const live = { ...book, progress: 40, currentChapterNumber: 400, lastCfi: 'epubcfi(/6/12!)',
      progressUpdatedAt: 300, pendingProgressSync: true, personalRating: 9,
      personalReview: 'Edited while syncing', personalReviewUpdatedAt: 300,
      pendingReviewSync: true, personalTags: ['New tag'], userDescription: 'New summary' };
    const result = reconcileCompletedCloudRefresh([book], [remote], [live]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: 'Updated source title', progress: 40, currentChapterNumber: 400,
      progressUpdatedAt: 300, pendingProgressSync: true,
      personalRating: 9, personalReview: 'Edited while syncing',
      pendingReviewSync: true, personalTags: ['New tag'], userDescription: 'New summary',
    });
  });
  it('accepts a newer remote position and review when local data did not change', () => {
    const remote = { ...book, progress: 70, progressUpdatedAt: 500,
      personalReview: 'New remote', personalReviewUpdatedAt: 500 };
    const result = reconcileCompletedCloudRefresh([book], [remote], [book]);
    expect(result[0].progress).toBe(70);
    expect(result[0].personalReview).toBe('New remote');
  });
  it('does not resurrect deleted books or discard a new local import', () => {
    const newBook: LibraryBook = { ...book, id: addedId, title: 'New offline import', cloud: false };
    const results = reconcileCompletedCloudRefresh([book], [book], [newBook]);
    expect(results).toEqual([newBook]);
  });
  it('does not clear a pending edit on equal millisecond timestamps', () => {
    const current = { ...book, progress: 11, pendingProgressSync: true,
      personalReview: 'New note', pendingReviewSync: true };
    const incoming = { ...book, progress: 10, pendingProgressSync: false,
      personalReview: 'Old note', pendingReviewSync: false };
    const result = reconcileCompletedCloudRefresh([book], [incoming], [current]);
    expect(result[0]).toMatchObject({ progress: 11, pendingProgressSync: true,
      personalReview: 'New note', pendingReviewSync: true });
  });
});
