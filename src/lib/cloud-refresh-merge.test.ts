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
  it('protects a new local edit even when the other device has a clock far in the future', () => {
    const remote = { ...book, progress: 70, progressUpdatedAt: 9_999_999,
      personalReview: 'Remote notes', personalReviewUpdatedAt: 9_999_999 };
    const live = { ...book, progress: 44, progressUpdatedAt: 101, pendingProgressSync: true,
      personalReview: 'New local edit', personalReviewUpdatedAt: 101, pendingReviewSync: true };
    const result = reconcileCompletedCloudRefresh([book], [remote], [live]);
    expect(result[0]).toMatchObject({ progress: 44, progressUpdatedAt: 101,
      pendingProgressSync: true, personalReview: 'New local edit',
      pendingReviewSync: true });
  });
  it('retains a competing remote revision while keeping newer local progress', () => {
    const remote = { ...book, progress: 10, pendingProgressSync: true,
      progressSyncConflict: { value: null, revision: 'b'.repeat(64) } };
    const live = { ...book, progress: 45, progressUpdatedAt: 101, pendingProgressSync: true };
    const result = reconcileCompletedCloudRefresh([book], [remote], [live]);
    expect(result[0].progress).toBe(45);
    expect(result[0].progressSyncConflict?.revision).toBe('b'.repeat(64));
  });
  it('accepts a newer remote position and review when local data did not change', () => {
    const remote = { ...book, progress: 70, progressUpdatedAt: 500,
      personalReview: 'New remote', personalReviewUpdatedAt: 500 };
    const result = reconcileCompletedCloudRefresh([book], [remote], [book]);
    expect(result[0].progress).toBe(70);
    expect(result[0].personalReview).toBe('New remote');
  });
  it('adopts newer cloud revisions even when the other device clock runs behind', () => {
    const initial = {
      ...book, progress: 79, progressUpdatedAt: 9300,
      progressCloudRevision: 'a'.repeat(64), pendingProgressSync: false,
      personalRating: 9, personalReview: 'Old local note', personalReviewUpdatedAt: 9300,
      reviewCloudRevision: 'a'.repeat(64), pendingReviewSync: false,
    };
    const next = {
      ...initial, progress: 80, progressUpdatedAt: 1700,
      progressCloudRevision: 'b'.repeat(64),
      personalRating: 7, personalReview: 'Approved latest cloud note',
      personalReviewUpdatedAt: 1700, reviewCloudRevision: 'b'.repeat(64),
    };
    const result = reconcileCompletedCloudRefresh([initial], [next], [initial]);
    expect(result[0]).toMatchObject({
      progress: 80, progressCloudRevision: 'b'.repeat(64),
      personalRating: 7, personalReview: 'Approved latest cloud note',
      reviewCloudRevision: 'b'.repeat(64),
      pendingProgressSync: false, pendingReviewSync: false,
    });
  });
  it('keeps an actual concurrent local edit over an adopted cloud revision', () => {
    const initial = {
      ...book, progressCloudRevision: 'a'.repeat(64),
      reviewCloudRevision: 'a'.repeat(64),
    };
    const remote = {
      ...initial, progress: 22, progressCloudRevision: 'b'.repeat(64),
      personalReview: 'Remote update', reviewCloudRevision: 'b'.repeat(64),
    };
    const live = {
      ...initial, progress: 91, pendingProgressSync: true,
      progressUpdatedAt: 101, personalReview: 'Edited while refreshing',
      pendingReviewSync: true, personalReviewUpdatedAt: 101,
    };
    const result = reconcileCompletedCloudRefresh([initial], [remote], [live]);
    expect(result[0].progress).toBe(91);
    expect(result[0].personalReview).toBe('Edited while refreshing');
    expect(result[0].pendingProgressSync).toBe(true);
    expect(result[0].pendingReviewSync).toBe(true);
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
