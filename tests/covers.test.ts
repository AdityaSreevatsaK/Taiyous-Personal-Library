import { afterEach, describe, expect, it, vi } from 'vitest';
import { blendCloudAndLocal, fetchCloudCatalog, fetchCloudCover, type CloudEntry, type CloudSession } from '../src/lib/cloud';
import type { LibraryBook } from '../src/types';
import { isAllowedDatasetPath } from '../functions/api/library';

const id = 'a'.repeat(24);
const repo = 'Example/Taiyous-Novels';
const coverPath = 'data/novels/' + id + '/cover.jpg';
const session: CloudSession = { accessToken: 'hf_01234567890123456789', username: 'Private dataset', expiresAt: Number.MAX_SAFE_INTEGER };
const book: LibraryBook = { id, title: 'Novel A', author: 'Someone', originalFileName: 'a.epub', importedAt: 1, progress: 0, size: 100 };
const entry: CloudEntry = { id, metadata: { ...book, cloud: true }, epubPath: 'data/novels/' + id + '/source.epub', coverPath };

afterEach(() => vi.unstubAllGlobals());

describe('private novel cover images', () => {
  it('accepts the uploader cover path without changing a novel ID', () => {
    expect(isAllowedDatasetPath(coverPath)).toBe(true);
    expect(isAllowedDatasetPath('data/novels/' + id + '/../cover.jpg')).toBe(false);
    expect(isAllowedDatasetPath('data/novels/' + id + '/fake.svg')).toBe(false);
    const merged = blendCloudAndLocal([entry], [{ ...book, personalRating: 8, progress: 48 }]);
    expect(merged[0].id).toBe(id);
    expect(merged[0].coverPath).toBe(coverPath);
    expect(merged[0].personalRating).toBe(8);
    expect(merged[0].progress).toBe(48);
  });
  it('validates a new coverPath on older version-1 catalogues', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const name = String(url);
      return new Response(JSON.stringify(name.includes('/api/datasets/') ? { private: true } : { version: 1, books: [entry] }));
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await fetchCloudCatalog(repo, session);
    expect(result.books[0].coverPath).toBe(coverPath);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects a cover path that points to another novel', async () => {
    const invalid = { ...entry, coverPath: 'data/novels/' + 'b'.repeat(24) + '/cover.jpg' };
    vi.stubGlobal('fetch', async (url: RequestInfo | URL) =>
      new Response(JSON.stringify(String(url).includes('/api/datasets/') ? { private: true } : { version: 1, books: [invalid] })));
    await expect(fetchCloudCatalog(repo, session)).rejects.toThrow(/catalogue is invalid/);
  });
  it('retrieves real JPEG content only with authorisation and correct matching path', async () => {
    const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2]);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, options?: RequestInit) => {
      expect(options?.headers).toHaveProperty('Authorization', 'Bearer ' + session.accessToken);
      return new Response(fakeJpeg, { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const blob = await fetchCloudCover(repo, { id, coverPath }, session);
    expect(blob?.type).toBe('image/jpeg');
    expect(blob?.size).toBe(fakeJpeg.length);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('keeps the generated fallback for no image, incorrect path or non-JPEG content', async () => {
    expect(await fetchCloudCover(repo, book, session)).toBeNull();
    expect(await fetchCloudCover(repo, { id, coverPath: 'data/novels/' + id + '/evil.svg' }, session)).toBeNull();
    vi.stubGlobal('fetch', async () => new Response(new Blob(['not-an-image'], { type: 'image/jpeg' })));
    expect(await fetchCloudCover(repo, { id, coverPath }, session)).toBeNull();
  });
});
