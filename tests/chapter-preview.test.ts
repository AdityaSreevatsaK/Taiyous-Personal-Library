import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/lib/chapter-index-cache', () => ({
  readCachedChapterIndex: vi.fn(async () => null),
  saveCachedChapterIndex: vi.fn(async () => undefined),
}));
vi.mock('../src/lib/storage', () => ({
  getBookFile: vi.fn(async () => { throw new Error('No persistent EPUB available'); }),
}));
vi.mock('epubjs', () => ({
  default: vi.fn(() => ({
    ready: Promise.resolve(), loaded: { navigation: Promise.resolve({
      toc: [{ label: 'Chapter 1', href: 'ch1.xhtml' }],
    }) },
    spine: { spineItems: [] }, destroy: vi.fn(),
  })),
}));
import { getBookFile } from '../src/lib/storage';
import { loadChapterCatalog } from '../src/lib/catalog';
describe('Chapter details preview does not require an offline download', () => {
  it('parses a transient EPUB without reading or writing the browser EPUB store', async () => {
    const ephemeral = vi.fn(async () => new Blob(['transient bytes'], {type:'application/epub+zip'}));
    const chapters = await loadChapterCatalog('0123456789abcdef01234567', 1, ephemeral);
    expect(chapters).toHaveLength(1);
    expect(chapters[0].label).toBe('Chapter 1');
    expect(ephemeral).toHaveBeenCalledTimes(1);
    expect(getBookFile).not.toHaveBeenCalled();
  });
});
