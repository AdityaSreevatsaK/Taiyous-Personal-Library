import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  blendCloudAndLocal, fetchCloudArchive, fetchCloudCatalog, fetchCloudCover,
  fetchCloudEpub, hostedEpubExists, uploadNovelToCloud,
  type CloudEntry, type CloudSession,
} from '../src/lib/cloud';
import type { LibraryBook } from '../src/types';

const id = 'a'.repeat(24);
const repo = 'Example/Taiyous-Novels';
const folder = 'data/novels/' + id + " - A Knight's Return";
const book: LibraryBook = {
  id, title: 'New Title After Migration', author: 'Fictional Author',
  originalFileName: 'source.epub', importedAt: 1, progress: 35, size: 20,
};
const entry: CloudEntry = {
  id, metadata: { ...book, coverPath: folder + '/cover.png', cloud: true },
  epubPath: folder + '/source.epub',
  archivePath: folder + '/original.zip',
};
const manual: CloudSession = {
  username: 'private', accessToken: 'hf_' + 'a'.repeat(20),
  expiresAt: Number.MAX_SAFE_INTEGER,
};
const oauth: CloudSession = { ...manual, via: 'oauth', accessToken: '' };
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('hosted readable novel folders in browser', () => {
  it('accepts metadata-only coverPath and preserves novel ID and personal progress', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      return new Response(JSON.stringify(String(url).includes('/api/datasets/')
        ? { private: true }
        : { version: 1, books: [entry] }));
    });
    vi.stubGlobal('fetch', fetcher);
    const catalogue = await fetchCloudCatalog(repo, manual);
    expect(catalogue.books[0].epubPath).toBe(entry.epubPath);
    expect(catalogue.books[0].metadata.coverPath).toBe(folder + '/cover.png');
    const blended = blendCloudAndLocal(catalogue.books, [{ ...book, personalRating: 9 }]);
    expect(blended[0].id).toBe(id);
    expect(blended[0].progress).toBe(35);
    expect(blended[0].personalRating).toBe(9);
    expect(blended[0].coverPath).toBe(folder + '/cover.png');
  });

  it('downloads EPUB/ZIP from catalogue paths, safely encoding spaces and Unicode', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      urls.push(String(url));
      return new Response(new Uint8Array([69, 80, 85, 66, 0, 1, 2]));
    }));
    expect((await fetchCloudEpub(repo, entry, manual)).size).toBe(7);
    expect((await fetchCloudArchive(repo, entry, manual)).size).toBe(7);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain('/' + id + '%20-%20A%20Knight');
    expect(urls[0]).toContain('/source.epub');
    expect(urls[1]).toContain('/original.zip');
  });

  it('checks readable EPUB existence through the OAuth gateway using encoded paths', async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain(encodeURIComponent(entry.epubPath));
      return new Response(JSON.stringify({ exists: true }));
    });
    vi.stubGlobal('fetch', fetcher);
    expect(await hostedEpubExists(repo, entry, oauth)).toBe(true);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('loads PNG, JPEG and WebP covers from the same folder and rejects masquerading content', async () => {
    const cases = [
      ['png', [137,80,78,71,13,10,26,10,0,0,0,0], 'image/png'],
      ['jpg', [255,216,255,224,0,1,2,3,4,5,6,7], 'image/jpeg'],
      ['jpeg', [255,216,255,224,0,1,2,3,4,5,6,7], 'image/jpeg'],
      ['webp', [...new TextEncoder().encode('RIFF'),0,0,0,0,...new TextEncoder().encode('WEBP')], 'image/webp'],
    ] as const;
    for (const [ext, bytes, mime] of cases) {
      const coverPath = folder + '/cover.' + ext;
      const fetcher = vi.fn(async (url: RequestInfo | URL) => {
        expect(String(url)).toContain(encodeURIComponent(id + " - A Knight's Return").replace(/%27/g, "'"));
        return new Response(new Uint8Array(bytes), { status: 200 });
      });
      vi.stubGlobal('fetch', fetcher);
      const cover = await fetchCloudCover(repo, { id, coverPath }, manual);
      expect(cover?.type).toBe(mime);
      expect(fetcher).toHaveBeenCalledOnce();
    }
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(new Blob(['<svg><script>danger</script></svg>'], { type: 'image/png' }))));
    expect(await fetchCloudCover(repo, { id, coverPath: folder + '/cover.png' }, manual)).toBeNull();
    expect(await fetchCloudCover(repo, { id, coverPath: 'data/novels/' + 'b'.repeat(24) + '/cover.jpg' }, manual)).toBeNull();
    expect(await fetchCloudCover(repo, { id, coverPath: folder + '/cover.svg' }, manual)).toBeNull();
  });

  it('attaches a newly supplied ZIP to the existing readable folder, not ID-only', async () => {
    const noZip = { ...entry, archivePath: undefined };
    let uploadPaths: string[] = [];
    const fetcher = vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const uri = String(url);
      if (uri.includes('action=info')) return new Response(JSON.stringify({ private: true }));
      if (uri.includes('action=file')) return new Response(JSON.stringify({
        version: 1, books: [noZip],
      }));
      if (uri.includes('action=upload')) {
        const payload = opts?.body as FormData;
        uploadPaths = payload.getAll('path') as string[];
        return new Response(JSON.stringify({ saved: true }));
      }
      throw new Error('Unexpected request ' + uri);
    });
    vi.stubGlobal('fetch', fetcher);
    const zip = new File(['zip contents'], 'original.zip', {type: 'application/zip'});
    const added = await uploadNovelToCloud(repo, oauth, zip, {
      metadata: book, epub: new Blob(['epub']),
    });
    expect(added).toBe('added');
    expect(uploadPaths).toEqual([folder + '/original.zip', 'data/library.json']);
    expect(uploadPaths).not.toContain('data/novels/' + id + '/original.zip');
  });

  it('creates readable folders for new web imports without changing stable novel IDs', async () => {
    let files: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, opts?: RequestInit) => {
      const uri = String(url);
      if (uri.includes('action=info')) return new Response(JSON.stringify({ private: true }));
      if (uri.includes('action=file')) return new Response(JSON.stringify({ version: 1, books: [] }));
      if (uri.includes('action=upload')) {
        files = (opts!.body as FormData).getAll('path') as string[];
        return new Response(JSON.stringify({ saved: true }));
      }
      throw Error('Unexpected request ' + uri);
    }));
    const added = await uploadNovelToCloud(repo, oauth,
      new File(['epub contents'], 'source.epub', { type: 'application/epub+zip' }),
      { metadata: book, epub: new Blob(['epub contents']) });
    expect(added).toBe('added');
    expect(files).toEqual(['data/novels/' + id + ' - New Title After Migration/source.epub', 'data/library.json']);
  });
});
