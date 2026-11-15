import ePub from 'epubjs';
import { firstRealChapterIndex, flattenToc, type NavigationNode } from './chapters';
import { getBookFile } from './storage';
import { readCachedChapterIndex, saveCachedChapterIndex } from './chapter-index-cache';
import type { ChapterItem } from '../types';

// Bound memory usage: retain parsed tables for at most three recently visited EPUBs.
const chapterCache = new Map<string, ChapterItem[]>();
const MAX_CACHED_CATALOGS = 3;

/**
 * Read the TOC from a locally stored EPUB without opening the reader or
 * modifying its saved location. Existing imports need no migration.
 */
export async function loadChapterCatalog(bookId: string, expectedCount?: number): Promise<ChapterItem[]> {
  // Persisted index avoids repeatedly decompressing a large EPUB after page
  // reloads. EPUB files are still fetched only through authenticated storage.
  const stored = await readCachedChapterIndex(bookId, expectedCount).catch(() => null);
  if (stored?.length) return stored;
  const file = await getBookFile(bookId);
  const key = `${bookId}:${file.size}:${expectedCount || 0}`;
  const found = chapterCache.get(key);
  if (found) {
    chapterCache.delete(key);
    chapterCache.set(key, found);
    return found;
  }
  const book: any = ePub(await file.arrayBuffer());
  try {
    await book.ready;
    const navigation = await book.loaded.navigation;
    const toc = flattenToc((navigation?.toc || []) as NavigationNode[]);
    const spine: ChapterItem[] = (book.spine?.spineItems || []).map((item: any, index: number) => ({
      label: `Section ${index + 1}`,
      href: item.href,
      level: 0,
    }));
    const all = toc.length ? toc : spine;
    const chapters = all.slice(firstRealChapterIndex(all, expectedCount));
    chapterCache.set(key, chapters);
    // A quota error must never interfere with normal reading.
    void saveCachedChapterIndex(bookId, expectedCount, chapters).catch(() => undefined);
    while (chapterCache.size > MAX_CACHED_CATALOGS) {
      const oldest = chapterCache.keys().next().value;
      if (oldest === undefined) break;
      chapterCache.delete(oldest);
    }
    return chapters;
  } finally {
    // Close temporary EPUB resources. The actual book Blob remains in IndexedDB.
    try { book.destroy(); } catch { /* already released */ }
  }
}

export const CHAPTERS_PER_PAGE = 50;

export function searchChapterCatalog(chapters: ChapterItem[], search: string): Array<ChapterItem & { number: number }> {
  const term = search.trim().toLocaleLowerCase();
  return chapters.flatMap((chapter, index) => {
    const number = index + 1;
    if (term && !chapter.label.toLocaleLowerCase().includes(term) && String(number) !== term && `chapter ${number}` !== term) return [];
    return [{ ...chapter, number }];
  });
}

export function resolveChapterNumber(chapters: ChapterItem[], value: string): ChapterItem | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  return Number.isSafeInteger(n) && n > 0 && n <= chapters.length ? chapters[n - 1] : null;
}
