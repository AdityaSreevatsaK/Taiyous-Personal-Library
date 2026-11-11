import { describe, expect, it } from 'vitest';
import { reconcileCloudLibrary, type CloudEntry } from './cloud';
import type { LibraryBook } from '../types';

function book(id: string, title: string, cloud = true): LibraryBook {
  return {
    id, title, author: 'Test Author', cloud, originalFileName: title + '.epub',
    importedAt: 1, progress: 23, size: 123, personalReview: 'Keep my note',
  } as LibraryBook;
}
function entry(value: LibraryBook): CloudEntry {
  return { id: value.id, metadata: value, epubPath: `data/novels/${value.id}/source.epub` };
}

describe('cloud catalogue reconciliation after a dataset is recreated', () => {
  const old = book('aaaaaaaaaaaaaaaaaaaaaaaa', 'Old hosted novel');
  const newer = book('bbbbbbbbbbbbbbbbbbbbbbbb', 'New hosted novel');

  it('hides stale metadata-only novels when the new remote catalogue is empty', () => {
    const result = reconcileCloudLibrary([], [old], []);
    expect(result.books).toEqual([]);
    expect(result.hiddenStaleEntries).toBe(1);
    expect(old.personalReview).toBe('Keep my note');
  });

  it('keeps locally cached EPUBs available even after their cloud dataset is deleted', () => {
    const result = reconcileCloudLibrary([], [old], [old.id]);
    expect(result.books).toEqual([old]);
    expect(result.hiddenStaleEntries).toBe(0);
  });

  it('shows the current hosted novels and cached offline novels, not missing old listings', () => {
    const cached = book('cccccccccccccccccccccccc', 'Offline import', false);
    const result = reconcileCloudLibrary([entry(newer)], [old, cached], [cached.id]);
    expect(result.books.map(b => b.id).sort()).toEqual([newer.id, cached.id].sort());
    expect(result.hiddenStaleEntries).toBe(1);
  });

  it('retains local notes and progress for novels that are still hosted', () => {
    const result = reconcileCloudLibrary([entry(newer)], [{ ...newer, personalRating: 9 }], []);
    expect(result.books).toHaveLength(1);
    expect(result.books[0].personalRating).toBe(9);
    expect(result.books[0].progress).toBe(23);
  });
});
