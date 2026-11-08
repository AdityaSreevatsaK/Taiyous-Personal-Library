import type { ChapterItem } from '../types';

export interface NavigationNode {
  label?: string;
  href?: string;
  subitems?: NavigationNode[];
}

export function flattenToc(items: NavigationNode[], level = 0): ChapterItem[] {
  return items.flatMap((item) => [
    ...(item.href ? [{ label: (item.label || 'Untitled chapter').trim(), href: item.href, level }] : []),
    ...flattenToc(item.subitems || [], level + 1),
  ]);
}

export function normalizeChapterHref(href: string): string {
  return decodeURI(href.split('#')[0].split('?')[0]).split('/').pop() || href;
}

export function findChapter(items: ChapterItem[], href: string): ChapterItem | undefined {
  const target = normalizeChapterHref(href);
  return items.find((item) => normalizeChapterHref(item.href) === target);
}

export function approximateProgress(index: number, spineLength: number, page = 1, totalPages = 1): number {
  if (spineLength <= 0) return 0;
  const fractionalPage = (Math.max(1, page) - 1) / Math.max(1, totalPages);
  return Math.max(0, Math.min(100, Math.round(((index + fractionalPage) / spineLength) * 1000) / 10));
}

/** Resolve a TOC chapter from an EPUB location, ignoring path and fragments. */
export function chapterIndexForHref(items: ChapterItem[], href: string): number {
  if (!href) return -1;
  const target = normalizeChapterHref(href);
  return items.findIndex((item) => normalizeChapterHref(item.href) === target);
}

/** Navigate chapter-by-chapter; never turn a page within the same chapter. */
export function nextChapterHref(items: ChapterItem[], href: string, direction: 'next' | 'prev'): string | null {
  const current = chapterIndexForHref(items, href);
  if (current < 0) return null;
  const next = current + (direction === 'next' ? 1 : -1);
  return next >= 0 && next < items.length ? items[next].href : null;
}

/** Exclude EPUB cover/title/table-of-contents front matter from chapter navigation. */
export function firstRealChapterIndex(items: ChapterItem[], knownChapterCount?: number): number {
  let offset = 0;
  while (offset < items.length - 1 && /^(cover|title\s*page|table\s*of\s*contents|contents)$/i.test(items[offset].label.trim())) offset++;
  const countOffset = knownChapterCount && items.length > knownChapterCount ? items.length - knownChapterCount : 0;
  // Use a numeric count only when the extras resemble front-matter; EPUBs can
  // have nested navigation entries whose number exceeds the chapter count.
  return countOffset > 0 && countOffset <= offset ? Math.max(offset, countOffset) : offset;
}
