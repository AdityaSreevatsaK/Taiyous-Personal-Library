import { describe, expect, it } from 'vitest';
import { isFinished, isCurrentlyReading, isOngoingNovel, readingProgressLabel, withUpdatedReadingPosition } from '../src/lib/reading-status';
import { applyCloudReadingProgress, validateReadingProgress } from '../src/lib/cloud';
import { selectHomeBooks } from '../src/lib/home-curation';
import type { LibraryBook } from '../src/types';
const book: LibraryBook = {
 id:'abcdefabcdefabcdefabcdef', title:'Finished novel', author:'Writer', originalFileName:'novel.epub',
 importedAt:10, progress:100, size:300, completedAt:400, progressUpdatedAt:400, cloud:true,
 personalReview:'Preserve private notes', personalRating:9,
};
describe('finished status survives re-reading',()=>{
 it('remains finished on jumping to an early chapter',()=>{
  const next=withUpdatedReadingPosition(book,{progress:2,currentChapter:'Chapter 2'},500);
  expect(next.progress).toBe(2); expect(next.completedAt).toBe(400);
  expect(next.pendingProgressSync).toBe(true); expect(isFinished(next)).toBe(true);
  expect(isCurrentlyReading(next)).toBe(false);
  expect(selectHomeBooks([next]).continueReading).toHaveLength(0);
 });
 it('captures legacy 100 percent completed books before a position update',()=>{
  const next=withUpdatedReadingPosition({...book,completedAt:undefined},{progress:12},500);
  expect(isFinished(next)).toBe(true); expect(next.completedAt).toBe(400);
 });
 it('synchronises completedAt when reading another chapter on a second device',()=>{
  const remote=validateReadingProgress({
   version:1,bookId:book.id,progress:2,completedAt:400,currentChapter:'Chapter 2',
   currentChapterIndex:1,currentChapterNumber:2,lastCfi:null,lastOpenedAt:800,updatedAt:800,
  },book.id);
  const merged=applyCloudReadingProgress({...book,completedAt:undefined,progress:3,progressUpdatedAt:200},remote);
  expect(merged.progress).toBe(2); expect(merged.completedAt).toBe(400); expect(isFinished(merged)).toBe(true);
 });
 it('migrates a legacy remote progress of 100 percent',()=>{
  const old=validateReadingProgress({version:1,bookId:book.id,progress:100,
    currentChapter:null,currentChapterIndex:null,currentChapterNumber:null,
    lastCfi:null,lastOpenedAt:null,updatedAt:350},book.id);
  const updated=applyCloudReadingProgress({...book,progress:1,completedAt:undefined,progressUpdatedAt:200},old);
  expect(updated.completedAt).toBe(350);
 });
 it('a newer legacy remote reading position does not erase a local completion',()=>{
  const legacy=validateReadingProgress({version:1,bookId:book.id,progress:5,
    currentChapter:null,currentChapterIndex:null,currentChapterNumber:null,
    lastCfi:null,lastOpenedAt:null,updatedAt:900},book.id);
  expect(applyCloudReadingProgress(book,legacy).completedAt).toBe(400);
 });
 it('rejects forged completedAt timestamp',()=>{
  const invalid={version:1,bookId:book.id,progress:5,completedAt:'yesterday',
   currentChapter:null,currentChapterIndex:null,currentChapterNumber:null,
   lastCfi:null,lastOpenedAt:null,updatedAt:900};
  expect(()=>validateReadingProgress(invalid,book.id)).toThrow();
 });
});

describe('ongoing serialisation: caught up is not finished', () => {
  const ongoing: LibraryBook = {
    ...book, title: 'Tales of Demons and Gods', status: 'Ongoing',
    progress: 100, currentChapterNumber: 507, chapterCount: 507,
  };

  it('keeps a 100% ongoing novel in Currently Reading, even with a stale completedAt marker', () => {
    expect(isOngoingNovel(ongoing)).toBe(true);
    expect(isFinished(ongoing)).toBe(false);
    expect(isCurrentlyReading(ongoing)).toBe(true);
    expect(readingProgressLabel(ongoing)).toBe('Caught up');
    expect(selectHomeBooks([ongoing]).continueReading).toEqual([ongoing]);
  });

  it('recognises common ongoing and hiatus source statuses without misreading completed titles', () => {
    for (const status of ['ongoing', 'On-going', 'On Going', 'updating', 'Serializing', 'Serialising', 'In Progress', 'Hiatus', 'On hold']) {
      expect(isOngoingNovel({ status })).toBe(true);
    }
    for (const status of ['Completed', 'Complete', 'Finished', 'Unknown', undefined]) {
      expect(isOngoingNovel({ status })).toBe(false);
    }
  });

  it('does not automatically stamp completedAt when reaching 100% on an ongoing novel', () => {
    const fresh = { ...ongoing, progress: 99, completedAt: undefined };
    const next = withUpdatedReadingPosition(fresh, { progress: 100 }, 600);
    expect(next.progress).toBe(100);
    expect(next.completedAt).toBeUndefined();
    expect(next.pendingProgressSync).toBe(true);
    expect(readingProgressLabel(next)).toBe('Caught up');
  });

  it('retains prior completion metadata without displaying ongoing books as Finished', () => {
    const revisited = withUpdatedReadingPosition(ongoing, { progress: 12 }, 600);
    expect(revisited.completedAt).toBe(400);
    expect(revisited.progress).toBe(12);
    expect(isFinished(revisited)).toBe(false);
    expect(readingProgressLabel(revisited)).toBe('Currently reading');
  });

  it('does not invent completion when restoring legacy 100% cloud progress for an ongoing novel', () => {
    const legacy = validateReadingProgress({
      version: 1, bookId: ongoing.id, progress: 100, currentChapter: 'Chapter 507',
      currentChapterIndex: 506, currentChapterNumber: 507, lastCfi: null,
      lastOpenedAt: 500, updatedAt: 500,
    }, ongoing.id);
    const restored = applyCloudReadingProgress({
      ...ongoing, progress: 12, completedAt: undefined, progressUpdatedAt: 200,
    }, legacy);
    expect(restored.completedAt).toBeUndefined();
    expect(restored.progress).toBe(100);
    expect(isCurrentlyReading(restored)).toBe(true);
    expect(readingProgressLabel(restored)).toBe('Caught up');
  });

  it('indicates new chapters when the source grows beyond the saved chapter', () => {
    const updatedSource = { ...ongoing, chapterCount: 508 };
    expect(updatedSource.progress).toBe(100); // Preserve the exact saved cursor.
    expect(isFinished(updatedSource)).toBe(false);
    expect(readingProgressLabel(updatedSource)).toBe('New chapters available');
    expect(isCurrentlyReading(updatedSource)).toBe(true);
    expect(readingProgressLabel({ ...updatedSource, currentChapterNumber: 508 })).toBe('Caught up');
  });

  it('preserves Hiatus and Dropped when older progress-sync data says finished', () => {
    for (const status of ['Hiatus', 'Dropped']) {
      const old = validateReadingProgress({
        version: 1, bookId: ongoing.id, progress: 100, completedAt: 400,
        currentChapter: 'Chapter 507', currentChapterIndex: 506,
        currentChapterNumber: 507, lastCfi: null,
        lastOpenedAt: 600, updatedAt: 600,
      }, ongoing.id);
      const reconciled = applyCloudReadingProgress({
        ...ongoing, status, progress: 12, completedAt: undefined,
        progressUpdatedAt: 200,
      }, old);
      expect(isFinished(reconciled)).toBe(false);
      expect(isCurrentlyReading(reconciled)).toBe(true);
    }
  });

  it('preserves completed and unknown-status legacy behaviour', () => {
    const finished = { ...ongoing, status: 'Completed', completedAt: undefined };
    expect(isFinished(finished)).toBe(true);
    expect(readingProgressLabel(finished)).toBe('Finished');
    expect(isFinished({ ...finished, status: undefined })).toBe(true);
  });
});
