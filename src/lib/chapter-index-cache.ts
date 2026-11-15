import { openDB, type DBSchema } from 'idb';
import type { ChapterItem } from '../types';

/** A small, private on-device TOC cache, separate from the EPUB/cover stores.
 * This avoids repeatedly parsing multi-thousand-chapter EPUBs.
 * Missing/invalid entries simply fall back to parsing the original EPUB.
 */
interface ChapterCacheDB extends DBSchema {
  indexes: { key: string; value: { key: string; chapters: ChapterItem[]; savedAt: number } };
}
let database: ReturnType<typeof openDB<ChapterCacheDB>> | null = null;
function open() {
  if (!database) database = openDB<ChapterCacheDB>('taiyou-chapter-index-v1', 1, {
    upgrade(db) { if (!db.objectStoreNames.contains('indexes')) db.createObjectStore('indexes', { keyPath: 'key' }); },
  }).catch(error => { database = null; throw error; });
  return database;
}
function keyFor(bookId: string, count?: number) {
  if (!/^[a-f0-9]{24}$/.test(bookId)) throw new Error('Invalid chapter index book ID');
  return bookId + ':' + (count || 0);
}
export async function readCachedChapterIndex(bookId: string, count?: number): Promise<ChapterItem[] | null> {
  const entry = await (await open()).get('indexes', keyFor(bookId, count));
  if (!entry || !Array.isArray(entry.chapters) || entry.chapters.length > 25000 ||
      entry.chapters.some(item => typeof item?.label !== 'string' || typeof item?.href !== 'string' ||
        item.label.length > 1000 || item.href.length > 1500 || !Number.isInteger(item.level))) return null;
  return entry.chapters;
}
export async function saveCachedChapterIndex(bookId: string, count: number | undefined, chapters: ChapterItem[]) {
  if (!chapters.length || chapters.length > 25000) return;
  await (await open()).put('indexes', { key: keyFor(bookId, count), chapters, savedAt: Date.now() });
}
