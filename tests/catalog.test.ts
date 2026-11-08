import { describe, expect, it } from 'vitest';
import { CHAPTERS_PER_PAGE, resolveChapterNumber, searchChapterCatalog } from '../src/lib/catalog';
import type { ChapterItem } from '../src/types';

const largeBook: ChapterItem[] = Array.from({ length: 1356 }, (_, i) => ({
  label: `Chapter ${i + 1}${i === 51 ? ': The Reckoning' : ''}`,
  href: `chapter_${String(i + 1).padStart(4, '0')}.xhtml`,
  level: 0,
}));

describe('Details page chapter browsing', () => {
  it('supports large novels without cutting off chapters', () => {
    expect(largeBook).toHaveLength(1356);
    expect(Math.ceil(largeBook.length / CHAPTERS_PER_PAGE)).toBe(28);
    expect(resolveChapterNumber(largeBook, '1356')?.href).toBe('chapter_1356.xhtml');
    expect(resolveChapterNumber(largeBook, '1')?.label).toBe('Chapter 1');
  });
  it('finds title matches and supports an exact chapter number', () => {
    expect(searchChapterCatalog(largeBook, 'reckoning').map(c => c.number)).toEqual([52]);
    expect(searchChapterCatalog(largeBook, '1356').some(c => c.number === 1356)).toBe(true);
    expect(searchChapterCatalog(largeBook, 'Chapter 52').some(c => c.number === 52)).toBe(true);
  });
  it('rejects invalid chapter requests', () => {
    for (const value of ['0', '-1', '1357', '1.2', 'xyz', '']) {
      expect(resolveChapterNumber(largeBook, value)).toBeNull();
    }
  });
});
