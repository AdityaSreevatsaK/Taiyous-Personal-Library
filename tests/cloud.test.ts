import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertPrivateDataset, blendCloudAndLocal, createCloudSession, validateDatasetRepo, uploadPrivateDatasetFiles } from '../src/lib/cloud';
import type { LibraryBook } from '../src/types';

const id = '0123456789abcdef01234567';
const shared: LibraryBook = { id, title: 'Cloud Novel', author: 'Writer', chapterCount: 624,
  originalFileName: 'novel.zip', importedAt: 120, progress: 0, size: 1024 };
const entry = { id, metadata: shared, epubPath: `data/novels/${id}/source.epub`, archivePath: `data/novels/${id}/original.zip` };

describe('private dataset ID validation', () => {
  it('allows a normal username/dataset ID', () => {
    expect(validateDatasetRepo(' reader/taiyous-novels ')).toBe('reader/taiyous-novels');
  });
  it('rejects path traversal, missing names and foreign URL forms', () => {
    expect(() => validateDatasetRepo('../private')).toThrow();
    expect(() => validateDatasetRepo('https://example.com/x')).toThrow();
    expect(() => validateDatasetRepo('username/')).toThrow();
  });
});

describe('merge remote catalogue with local progress', () => {
  it('keeps reading progress and personal tags while importing hosted metadata', () => {
    const saved: LibraryBook = { ...shared, title: 'Old Title', personalTags: ['Favourite'], progress: 25,
      lastCfi: 'epubcfi(/6/4!)', currentChapterNumber: 156 };
    const books = blendCloudAndLocal([entry], [saved]);
    expect(books).toHaveLength(1);
    expect(books[0]).toMatchObject({ title: 'Cloud Novel', personalTags: ['Favourite'],
      progress: 25, currentChapterNumber: 156, cloud: true });
  });
  it('omits unsafe catalogue paths', () => {
    const books = blendCloudAndLocal([{ ...entry, epubPath: '../evil.epub' }], []);
    expect(books).toHaveLength(0);
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('fail-closed cloud repository visibility', () => {
  const session = { accessToken: 'test-only', expiresAt: Date.now() + 60_000, username: 'reader' };
  it('refuses a public dataset before uploading content', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ private: false }) })));
    await expect(assertPrivateDataset('reader/taiyous-novels', session)).rejects.toThrow('NOT PRIVATE');
  });
  it('accepts a private dataset', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ private: true }) })));
    await expect(assertPrivateDataset('reader/taiyous-novels', session)).resolves.toBeUndefined();
  });
});

describe('private dataset credential session', () => {
  it('accepts a scoped Hugging Face token in memory', () => {
    const session = createCloudSession('reader/taiyous-novels', ' hf_ABCDEFGHIJKLMNOP123456 ');
    expect(session.accessToken).toBe('hf_ABCDEFGHIJKLMNOP123456');
    expect(session.expiresAt).toBe(Number.MAX_SAFE_INTEGER);
  });
  it('rejects missing or unexpected tokens', () => {
    expect(() => createCloudSession('reader/taiyous-novels', 'x')).toThrow();
    expect(() => createCloudSession('reader/taiyous-novels', 'Bearer hf_ABCDEF1234567890')).toThrow();
  });
});


describe('manual bearer-token uploads must not bypass revisioned sync', () => {
  it('refuses unguarded personal notes, collections, and progress writes', async () => {
    const manual = createCloudSession('reader/taiyous-novels', 'hf_' + 'x'.repeat(32));
    const paths = ['data/personal/collections.json',
      'data/personal/reviews/' + id + '.json',
      'data/personal/progress/' + id + '.json'];
    for (const path of paths) {
      await expect(uploadPrivateDatasetFiles('reader/taiyous-novels', manual,
        [{ path, content: new Blob(['{"version":1}']) }], 'Unsafe write'))
        .rejects.toThrow(/OAuth sign-in/);
    }
  });
  it('also rejects novel and catalogue writes from legacy tokens', async () => {
    const manual = createCloudSession('reader/taiyous-novels', 'hf_' + 'x'.repeat(32));
    for (const path of ['data/library.json', 'data/novels/' + id + '/source.epub']) {
      await expect(uploadPrivateDatasetFiles('reader/taiyous-novels', manual,
        [{ path, content: new Blob(['placeholder']) }], 'Unsafe write'))
        .rejects.toThrow(/OAuth sign-in/);
    }
  });
});
