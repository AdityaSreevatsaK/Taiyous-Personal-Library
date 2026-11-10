import { describe, expect, it } from 'vitest';
import { findCloudEntryForBook, type CloudEntry } from './cloud';
import type { LibraryBook } from '../types';

function makeEntry(id: string, title: string, author: string): CloudEntry {
  const metadata = { id, title, author, originalFileName: 'book.epub', importedAt: 1, progress: 0, size: 100 } as LibraryBook;
  return { id, metadata, epubPath: `data/novels/${id}/source.epub` };
}

describe('hosted EPUB resolution', () => {
  const first = makeEntry('aaaaaaaaaaaaaaaaaaaaaaaa', 'True Martial World', 'Cocooned Cow');
  const second = makeEntry('bbbbbbbbbbbbbbbbbbbbbbbb', 'I Can Track Everything', 'Sanmao Wu');

  it('prefers exact IDs when available', () => {
    expect(findCloudEntryForBook([first, second], { id: first.id, title: 'Other', author: 'Other' })).toBe(first);
  });

  it('recovers a uniquely named older local import with a different ID', () => {
    expect(findCloudEntryForBook([first, second], { id: 'cccccccccccccccccccccccc', title: ' true  martial world ', author: 'COCOONED COW' })).toBe(first);
  });

  it('does not silently use a different author', () => {
    expect(findCloudEntryForBook([first], { id: 'cccccccccccccccccccccccc', title: first.metadata.title, author: 'Different author' })).toBeUndefined();
  });

  it('rejects ambiguous matches', () => {
    const duplicate = makeEntry('dddddddddddddddddddddddd', 'True Martial World', 'Cocooned Cow');
    expect(findCloudEntryForBook([first, duplicate], { id: 'cccccccccccccccccccccccc', title: first.metadata.title, author: first.metadata.author })).toBeUndefined();
  });

  it('returns no match for an unavailable book', () => {
    expect(findCloudEntryForBook([first, second], { id: 'cccccccccccccccccccccccc', title: 'Not in catalogue', author: 'Someone' })).toBeUndefined();
  });
});
