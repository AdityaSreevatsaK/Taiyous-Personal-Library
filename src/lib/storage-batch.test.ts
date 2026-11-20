import { describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import type { LibraryBook } from '../types';

vi.mock('idb', () => ({ openDB: vi.fn() }));
import { updateBooks } from './storage';

describe('efficient cloud metadata persistence', () => {
  it('does not open IndexedDB if there are no records', async () => {
    await updateBooks([]);
    expect(openDB).not.toHaveBeenCalled();
  });
  it('writes hundreds of records in one atomic readwrite transaction', async () => {
    const saved: string[] = [];
    const put = vi.fn(async (book: LibraryBook) => { saved.push(book.id); });
    const objectStore = vi.fn(() => ({ put }));
    const transaction = vi.fn(() => ({ objectStore, done: Promise.resolve() }));
    vi.mocked(openDB).mockResolvedValue({ transaction } as never);
    const records: LibraryBook[] = Array.from({ length: 300 }, (_, i) => ({
      id: i.toString(16).padStart(24, '0'), title: 'Book ' + i, author: 'Author',
      originalFileName: 'novel.epub', importedAt: 1, progress: 0, size: 100,
    }));
    await updateBooks(records);
    expect(openDB).toHaveBeenCalledOnce();
    expect(transaction).toHaveBeenCalledExactlyOnceWith('books', 'readwrite');
    expect(objectStore).toHaveBeenCalledOnce();
    expect(put).toHaveBeenCalledTimes(records.length);
    expect(saved).toEqual(records.map(book => book.id));
  });
});
