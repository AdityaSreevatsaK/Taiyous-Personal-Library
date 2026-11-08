import { describe, expect, it } from 'vitest';
import { approximateProgress, chapterIndexForHref, findChapter, firstRealChapterIndex, flattenToc, nextChapterHref, normalizeChapterHref } from '../src/lib/chapters';

describe('EPUB chapter navigation', () => {
  it('flattens nested table-of-contents entries', () => {
    expect(flattenToc([
      { label: 'Part One', href: 'part.xhtml', subitems: [{ label: ' Chapter 1 ', href: 'file0001.xhtml' }] },
      { label: 'Chapter 2', href: 'file0002.xhtml' },
    ])).toEqual([
      { label: 'Part One', href: 'part.xhtml', level: 0 },
      { label: 'Chapter 1', href: 'file0001.xhtml', level: 1 },
      { label: 'Chapter 2', href: 'file0002.xhtml', level: 0 },
    ]);
  });
  it('matches section hrefs with path and anchor differences', () => {
    const chapters = flattenToc([{ label: 'Chapter 10', href: 'Text/file0010.xhtml#intro' }]);
    expect(findChapter(chapters, 'OEBPS/Text/file0010.xhtml')?.label).toBe('Chapter 10');
    expect(normalizeChapterHref('Text/chapter%201.xhtml#section')).toBe('chapter 1.xhtml');
  });
  it('moves between chapters rather than within a chapter', () => {
    const chapters = flattenToc([
      { label: 'Chapter 1', href: 'OEBPS/file0001.xhtml' },
      { label: 'Chapter 2', href: 'OEBPS/file0002.xhtml' },
      { label: 'Chapter 3', href: 'OEBPS/file0003.xhtml' },
    ]);
    expect(chapterIndexForHref(chapters, 'file0002.xhtml#paragraph-30')).toBe(1);
    expect(nextChapterHref(chapters, 'file0002.xhtml#paragraph-30', 'next')).toBe('OEBPS/file0003.xhtml');
    expect(nextChapterHref(chapters, 'file0002.xhtml#paragraph-30', 'prev')).toBe('OEBPS/file0001.xhtml');
    expect(nextChapterHref(chapters, 'file0003.xhtml', 'next')).toBeNull();
    expect(nextChapterHref(chapters, 'file0001.xhtml', 'prev')).toBeNull();
  });
  it("skips a title page, not the novel's first chapter", () => {
    const chapters = flattenToc([
      {label: 'Title Page', href: 'title_page.xhtml'},
      {label: 'Chapter 1', href: 'file0001.xhtml'},
      {label: 'Chapter 2', href: 'file0002.xhtml'},
    ]);
    expect(firstRealChapterIndex(chapters, 2)).toBe(1);
    expect(firstRealChapterIndex(chapters)).toBe(1);
  });
  it('bounds approximate progress and tracks within a section', () => {
    expect(approximateProgress(0, 625, 1, 5)).toBe(0);
    expect(approximateProgress(10, 100, 5, 10)).toBe(10.4);
    expect(approximateProgress(900, 100)).toBe(100);
    expect(approximateProgress(3, 0)).toBe(0);
  });
});
