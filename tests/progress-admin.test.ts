import { describe, expect, it } from 'vitest';
import { resetReadingProgress } from '../src/lib/progress-admin';
import type { LibraryBook } from '../src/types';

const book: LibraryBook = {
  id:'abcdefabcdefabcdefabcdef', title:'Abe the Wizard', author:'Writer',
  originalFileName:'novel.epub', importedAt:10, progress:80,
  currentChapter:'Chapter 500', currentChapterIndex:499, currentChapterNumber:500,
  lastCfi:'epubcfi(/6/500)', lastOpenedAt:321, progressUpdatedAt:500,
  size:12345, cloud:true, personalRating:9, personalReview:'Keep these notes',
  personalTags:['Favourite'], sourceTags:['Fantasy'], userDescription:'Keep this summary',
};
describe('Owner reading-progress reset', () => {
  it('clears only the reading position and preserves all book metadata and notes', () => {
    const updated=resetReadingProgress(book,600);
    expect(updated).toMatchObject({ id:book.id, title:book.title, progress:0,
      pendingProgressSync:true, progressUpdatedAt:600, personalRating:9,
      personalReview:'Keep these notes', personalTags:['Favourite'], sourceTags:['Fantasy'] });
    expect(updated.lastCfi).toBeUndefined();
    expect(updated.currentChapterNumber).toBeUndefined();
    expect(updated.currentChapterIndex).toBeUndefined();
    expect(updated.lastOpenedAt).toBeUndefined();
    expect(book.progress).toBe(80);
  });
  it('clears the Finished marker only when explicitly resetting the progress', () => {
    const previouslyFinished = { ...book, progress: 21, completedAt: 430 };
    const updated = resetReadingProgress(previouslyFinished, 600);
    expect(updated.progress).toBe(0);
    expect(updated.completedAt).toBeUndefined();
    expect(previouslyFinished.completedAt).toBe(430);
  });

  it('does not allow stale remote progress to win a same-millisecond reset', () => {
    expect(resetReadingProgress(book,499).progressUpdatedAt).toBe(501);
  });
  it('keeps local-only EPUB identities and avoids unnecessary cloud sync', () => {
    const local=resetReadingProgress({...book,cloud:false},600);
    expect(local.pendingProgressSync).toBe(false);
    expect(local.id).toBe(book.id);
    expect(local.size).toBe(book.size);
  });
});
