import { describe, expect, it } from 'vitest';
import { isFinished, isCurrentlyReading, withUpdatedReadingPosition } from '../src/lib/reading-status';
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