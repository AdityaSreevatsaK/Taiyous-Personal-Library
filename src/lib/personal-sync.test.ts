import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncReadingRecord, syncReviewRecord } from './personal-sync';
import type { LibraryBook } from '../types';
import type { CloudSession } from './cloud';

const bookId = 'a'.repeat(24);
const first = 'a'.repeat(64);
const newer = 'b'.repeat(64);
const savedRevision = 'c'.repeat(64);
const session: CloudSession = {
  via: 'oauth', accessToken: '', expiresAt: Number.MAX_SAFE_INTEGER, username: 'fixture',
};
const localBook = (changes: Partial<LibraryBook> = {}): LibraryBook => ({
  id: bookId, title: 'Fixture book', author: 'Fixture',
  originalFileName: 'fixture.epub', importedAt: 1, size: 128, progress: 0, ...changes,
});
const progress = {
  version: 1, bookId, progress: 25, completedAt: null,
  currentChapter: 'Chapter 25', currentChapterIndex: 24, currentChapterNumber: 25,
  lastCfi: null, lastOpenedAt: 1_300_000, updatedAt: 1_300_000,
};

afterEach(() => vi.unstubAllGlobals());

describe('revision-aware progress and review sync', () => {
  it('preserves local progress and the competing cloud copy despite remote clock skew', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, opts?: RequestInit) => {
      calls.push(opts?.method || 'GET');
      return new Response(JSON.stringify({ value: progress, revision: newer }));
    }));
    const result = await syncReadingRecord('owner/private', session, bookId,
      localBook({ progress: 65, progressUpdatedAt: 700_000,
        currentChapterNumber: 65, pendingProgressSync: true,
        progressCloudRevision: first }));
    expect(result.progress).toBe(65);
    expect(result.pendingProgressSync).toBe(true);
    expect(result.progressSyncConflict?.value?.progress).toBe(25);
    expect(calls).toEqual(['GET']);
  });

  it('sends the observed content revision in an authorised upload', async () => {
    const calls: Array<{method: string; body?: unknown}> = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, opts?: RequestInit) => {
      const method = opts?.method || 'GET';
      const body = opts?.body ? JSON.parse(String(opts.body)) as unknown : undefined;
      calls.push({method,body});
      return new Response(JSON.stringify(method === 'GET'
        ? { value: progress, revision: newer }
        : { saved: true, value: (body as {value: unknown}).value, revision: savedRevision }));
    }));
    const result = await syncReadingRecord('owner/private', session, bookId,
      localBook({ progress: 82, completedAt: 12345, progressUpdatedAt: 700_000,
        pendingProgressSync: true, progressCloudRevision: newer }));
    expect(result.pendingProgressSync).toBe(false);
    expect(result.progressCloudRevision).toBe(savedRevision);
    expect((calls[1].body as {baseRevision: string}).baseRevision).toBe(newer);
    expect((calls[1].body as {value: {completedAt: number}}).value.completedAt).toBe(12345);
  });

  it('retains conflicting offline notes and does not publish them unattended', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: unknown, opts?: RequestInit) => {
      calls.push(opts?.method || 'GET');
      return new Response(JSON.stringify({
        value: {version: 1,bookId,rating: 8,comments: 'Other device',updatedAt: 1_300_000},
        revision: newer,
      }));
    }));
    const result = await syncReviewRecord('owner/private', session, bookId,
      localBook({ personalRating: 10, personalReview: 'My offline notes',
        personalReviewUpdatedAt: 700_000, reviewCloudRevision: first,
        pendingReviewSync: true }));
    expect(result.personalReview).toBe('My offline notes');
    expect(result.pendingReviewSync).toBe(true);
    expect(result.reviewSyncConflict?.value?.comments).toBe('Other device');
    expect(calls).toEqual(['GET']);
  });

  it('keeps a cloud Finished marker when adopting existing cloud progress', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      value: { ...progress, progress: 7, completedAt: 5000 }, revision: newer,
    }))));
    const result = await syncReadingRecord('owner/private', session, bookId,
      localBook({ progress: 0 }));
    expect(result.progress).toBe(7);
    expect(result.completedAt).toBe(5000);
    expect(result.progressCloudRevision).toBe(newer);
  });
});
