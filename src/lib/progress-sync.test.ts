import { describe, expect, it } from 'vitest';
import { applyCloudReadingProgress, validateReadingProgress } from './cloud';
import type { LibraryBook } from '../types';

const bookId = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const book = { id: bookId, title: 'Sample', author: 'Someone', originalFileName: 'sample.epub', progress: 10, size: 100, importedAt: 1 } as LibraryBook;
const remote = { version: 1, bookId, progress: 47.5, currentChapter: 'Chapter 3', currentChapterIndex: 2, currentChapterNumber: 3, lastCfi: 'epubcfi(/6/4)', lastOpenedAt: 200, updatedAt: 300 } as const;

describe('private reading progress sync', () => {
  it('validates the shape and restores progress to a new device', () => {
    expect(validateReadingProgress(remote, bookId)).toEqual(remote);
    const result = applyCloudReadingProgress(book, remote);
    expect(result.progress).toBe(47.5);
    expect(result.currentChapter).toBe('Chapter 3');
    expect(result.pendingProgressSync).toBe(false);
  });
  it('retains the local Finished marker if a later cloud position is earlier in the novel', () => {
    const completed = { ...book, progress: 15, completedAt: 200 };
    const result = applyCloudReadingProgress(completed, { ...remote, progress: 12, updatedAt: 350 });
    expect(result.progress).toBe(12);
    expect(result.completedAt).toBe(200);
  });

  it('does not overwrite a newer unsynced local position', () => {
    expect(applyCloudReadingProgress({ ...book, progress: 81, progressUpdatedAt: 400, pendingProgressSync: true }, remote).progress).toBe(81);
  });
  it('rejects a different book, invalid percentage, and invalid CFI', () => {
    expect(() => validateReadingProgress({ ...remote, bookId: 'bbbbbbbbbbbbbbbbbbbbbbbb' }, bookId)).toThrow();
    expect(() => validateReadingProgress({ ...remote, progress: 110 }, bookId)).toThrow();
    expect(() => validateReadingProgress({ ...remote, lastCfi: 'x'.repeat(4001) }, bookId)).toThrow();
  });
  it('accepts chapter and location values cleared to null', () => {
    expect(validateReadingProgress({ ...remote, currentChapter: null, lastCfi: null, currentChapterIndex: null }, bookId).lastCfi).toBeNull();
  });
});
