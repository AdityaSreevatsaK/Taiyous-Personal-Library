import { describe, expect, it } from 'vitest';
import { normalisePublicationStatus, publicationStatusDisplay,
  publicationStatusTone, publicationStatusRank } from '../src/lib/publication-status';
import { isCurrentlyReading, isFinished, isOngoingNovel,
  readingProgressLabel, withUpdatedReadingPosition } from '../src/lib/reading-status';
import type { LibraryBook } from '../src/types';

const book = (status?: string): LibraryBook => ({
  id: 'bbbbbbbbbbbbbbbbbbbbbbbb', title: 'Legacy novel', author: 'Writer',
  originalFileName: 'novel.epub', importedAt: 1, size: 2, progress: 100,
  currentChapterNumber: 507, chapterCount: 507, status,
  completedAt: 1234, cloud: true,
});

describe('independent publication statuses', () => {
  it('canonicalises known aliases without rewriting raw catalogue values', () => {
    for (const [input, expected] of [
      ['Completed', 'Completed'], ['complete', 'Completed'],
      ['finished', 'Completed'], ['On-going', 'Ongoing'],
      ['ON GOING', 'Ongoing'], ['serialising', 'Ongoing'],
      ['Hiatus', 'Hiatus'], ['On Hiatus', 'Hiatus'],
      ['on_hold', 'Hiatus'], ['paused', 'Hiatus'],
      ['Dropped', 'Dropped'], ['discontinued', 'Dropped'],
      ['abandoned', 'Dropped'],
    ] as const) {
      expect(normalisePublicationStatus(input)).toBe(expected);
      expect(publicationStatusDisplay(input)).toBe(expected);
    }
    expect(normalisePublicationStatus('Something Else')).toBeUndefined();
    expect(publicationStatusDisplay('Special legacy status')).toBe('Special legacy status');
    expect(publicationStatusDisplay(undefined)).toBe('Unknown');
  });

  it('makes every publication state sortable and gives distinct badge classes', () => {
    const values = ['Completed', 'Ongoing', 'Hiatus', 'Dropped', undefined];
    expect(values.map(publicationStatusRank)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(values.map(publicationStatusTone)).size).toBe(5);
  });

  it('never places Hiatus or Dropped in Finished, even with stale completion markers', () => {
    for (const status of ['Ongoing', 'Hiatus', 'Dropped', 'on hold', 'discontinued']) {
      const item = book(status);
      expect(isOngoingNovel(item)).toBe(true);
      expect(isFinished(item)).toBe(false);
      expect(isCurrentlyReading(item)).toBe(true);
      expect(withUpdatedReadingPosition({ ...item, completedAt: undefined }, { progress: 100 }, 4000).completedAt)
        .toBeUndefined();
    }
    expect(readingProgressLabel(book('Hiatus'))).toBe('Caught up');
    expect(readingProgressLabel(book('Dropped'))).toBe('All available chapters read');
    expect(readingProgressLabel({ ...book('Dropped'), chapterCount: 508 })).toBe('New chapters available');
  });

  it('preserves legacy Finished classification for completed and unrecognised records', () => {
    expect(isFinished(book('Completed'))).toBe(true);
    expect(isFinished(book(undefined))).toBe(true);
    expect(isFinished(book('Legacy value'))).toBe(true);
    expect(isFinished({ ...book('Hiatus'), progress: 0 })).toBe(false);
    expect(readingProgressLabel({ ...book('Hiatus'), progress: 0 })).toBe('Not started');
  });
});
