import ePub from 'epubjs';
import { firstRealChapterIndex, flattenToc, type NavigationNode } from './chapters';
import { getBookFile } from './storage';
import type { ChapterItem } from '../types';

/**
 * Read the TOC from a locally stored EPUB without opening the reader or
 * modifying its saved location. Existing imports need no migration.
 */
export async function loadChapterCatalog(bookId: string, expectedCount?: number): Promise<ChapterItem[]> {
  const file = await getBookFile(bookId);
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
    return all.slice(firstRealChapterIndex(all, expectedCount));
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
