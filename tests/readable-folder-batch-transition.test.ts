import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCloudArchive, fetchCloudCover, fetchCloudEpub,
  reconcileCloudLibrary, type CloudEntry, type CloudSession,
} from '../src/lib/cloud';
import type { LibraryBook } from '../src/types';

const a = 'a'.repeat(24);
const b = 'b'.repeat(24);
const repo = 'Example/Private-Novels';
const oldA = 'data/novels/' + a;
const movedA = oldA + ' - A Book in a Larger World';
const oldB = 'data/novels/' + b;
const movedB = oldB + ' - 修仙 第二卷';
const oauth: CloudSession = { username: 'Tester', accessToken: '',
  expiresAt: Number.MAX_SAFE_INTEGER, via: 'oauth' };
const manual: CloudSession = { ...oauth, accessToken: 'hf_' + 'x'.repeat(32), via: undefined };

function hosted(id: string, title: string, folder: string): CloudEntry {
  return {
    id, epubPath: folder + '/source.epub',
    archivePath: folder + '/original.zip',
    metadata: {
      id, title, author: 'Fictional Author',
      originalFileName: 'book.epub', importedAt: 1, progress: 0, size: 100,
      coverPath: folder + '/cover.png',
    },
  };
}

const originalA = hosted(a, 'New title differs from folder label', oldA);
const movedEntryA = hosted(a, 'New title differs from folder label', movedA);
const originalB = hosted(b, 'Another title', oldB);
const movedEntryB = hosted(b, 'Another title', movedB);
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function oauthMock(latest: CloudEntry[], onFile: (path: string) => Response) {
  const paths: string[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL) => {
    const uri = new URL(String(input), 'https://reader.example');
    const action = uri.searchParams.get('action');
    if (action === 'info') return new Response(JSON.stringify({ private: true }));
    if (action !== 'file') throw new Error('Unexpected gateway request');
    const path = uri.searchParams.get('path')!;
    paths.push(path);
    if (path === 'data/library.json')
      return new Response(JSON.stringify({ version: 1, books: latest }));
    return onFile(path);
  });
  vi.stubGlobal('fetch', fetcher);
  return { paths, fetcher };
}

describe('reader recovery while Storage Controller migrates novel batches', () => {
  it('recovers an EPUB path after a batch moves it without changing the novel ID', async () => {
    const { paths } = oauthMock([movedEntryA, originalB], path =>
      path === oldA + '/source.epub'
        ? new Response(null, { status: 404 })
        : path === movedA + '/source.epub'
          ? new Response(new Uint8Array([1,2,3,4]))
          : new Response(null, { status: 404 }),
    );
    expect((await fetchCloudEpub(repo, originalA, oauth)).size).toBe(4);
    expect(paths).toEqual([
      oldA + '/source.epub', 'data/library.json', movedA + '/source.epub',
    ]);
  });

  it('handles consecutive batches and preserves personal reading state and offline IDs', async () => {
    const localA: LibraryBook = {
      ...originalA.metadata, personalTags: ['Favourite'], personalRating: 9,
      personalReview: 'Keep this note', progress: 73, lastCfi: 'epubcfi(/6/8!)',
      currentChapterIndex: 4, cloud: true,
    };
    const localB: LibraryBook = {
      ...originalB.metadata, progress: 22, personalReview: 'Try next chapter', cloud: true,
    };
    const firstBatch = reconcileCloudLibrary([movedEntryA, originalB], [localA, localB], [a, b]);
    const secondBatch = reconcileCloudLibrary([movedEntryA, movedEntryB], firstBatch.books, [a, b]);
    expect(secondBatch.hiddenStaleEntries).toBe(0);
    expect(secondBatch.books.map(book => book.id).sort()).toEqual([a,b]);
    expect(secondBatch.books.find(book => book.id === a)).toMatchObject({
      progress: 73, personalRating: 9, personalReview: 'Keep this note',
      personalTags: ['Favourite'], lastCfi: 'epubcfi(/6/8!)',
      currentChapterIndex: 4, cloud: true, coverPath: movedA + '/cover.png',
    });
    expect(secondBatch.books.find(book => book.id === b)).toMatchObject({
      progress: 22, personalReview: 'Try next chapter',
      cloud: true, coverPath: movedB + '/cover.png',
    });

    const { paths } = oauthMock([movedEntryA, movedEntryB], path =>
      path === oldB + '/original.zip'
        ? new Response(null, {status: 404})
        : path === movedB + '/original.zip'
          ? new Response(new Uint8Array([80,75,3,4,1,2]))
          : new Response(null,{status:404}),
    );
    expect((await fetchCloudArchive(repo, originalB, oauth)).size).toBe(6);
    expect(paths).toEqual([oldB + '/original.zip', 'data/library.json', movedB + '/original.zip']);
  });

  it('recovers moved cover artwork from catalogue metadata only', async () => {
    const { paths } = oauthMock([movedEntryA], path =>
      path === oldA + '/cover.png'
        ? new Response(null, { status: 404 })
        : path === movedA + '/cover.png'
          ? new Response(png, { status: 200 })
          : new Response(null, { status: 404 }),
    );
    const blob = await fetchCloudCover(repo, {id: a, coverPath: oldA + '/cover.png'}, oauth);
    expect(blob?.type).toBe('image/png');
    expect(paths).toEqual([oldA + '/cover.png', 'data/library.json', movedA + '/cover.png']);
  });

  it('never follows a different novel ID or guesses a path from the novel title', async () => {
    const { paths } = oauthMock([movedEntryB], () => new Response(null, {status:404}));
    await expect(fetchCloudEpub(repo, originalA, oauth)).rejects.toThrow('(404)');
    expect(paths).toEqual([oldA + '/source.epub', 'data/library.json']);
  });

  it('never retries on authorisation failure', async () => {
    const { paths } = oauthMock([movedEntryA], () => new Response(null, {status:403}));
    await expect(fetchCloudEpub(repo, originalA, oauth)).rejects.toThrow('permissions');
    expect(paths).toEqual([oldA + '/source.epub']);
  });

  it('does not follow an unverified catalogue path or a cross-book cover', async () => {
    const bad: CloudEntry = { ...movedEntryA, archivePath: oldB + '/original.zip' };
    const { paths } = oauthMock([bad], () => new Response(null, {status:404}));
    await expect(fetchCloudArchive(repo, originalA, oauth)).rejects.toThrow('(404)');
    expect(paths).toEqual([oldA + '/original.zip', 'data/library.json']);
  });

  it('does not generate a second download when a book has not moved', async () => {
    const { paths } = oauthMock([originalA], () => new Response(null, { status: 404 }));
    await expect(fetchCloudEpub(repo, originalA, oauth)).rejects.toThrow('(404)');
    expect(paths).toEqual([oldA + '/source.epub', 'data/library.json']);
  });

  it('works with an existing personal-token connection without writing private data', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const uri = String(input);
      expect(init?.headers).toHaveProperty('Authorization');
      expect(init?.method ?? 'GET').toBe('GET');
      seen.push(uri);
      if (uri.includes('/api/datasets/')) return new Response(JSON.stringify({ private: true }));
      if (uri.includes('data%2Flibrary.json') || uri.includes('data/library.json'))
        return new Response(JSON.stringify({ version: 1, books: [movedEntryA] }));
      if (uri.includes('/' + a + '/source.epub'))
        return new Response(null, { status: 404 });
      return new Response(new Uint8Array([1,2,3,4]));
    }));
    expect((await fetchCloudEpub(repo, originalA, manual)).size).toBe(4);
    expect(seen.filter(uri => uri.includes('/resolve/'))).toHaveLength(3);
  });
});
