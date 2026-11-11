import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  syncReadingRecord, syncReviewRecord, resolveReadingConflict, resolveReviewConflict,
} from './personal-sync';
import type { CloudSession } from './cloud';
import type { LibraryBook } from '../types';

const id = 'a'.repeat(24);
const revisionA = 'a'.repeat(64), revisionB = 'b'.repeat(64), revisionC = 'c'.repeat(64);
const session: CloudSession = {
  accessToken: '', username: 'Hugging Face', expiresAt: Number.MAX_SAFE_INTEGER, via: 'oauth',
};
const book = (changes: Partial<LibraryBook> = {}): LibraryBook => ({
  id, title: 'Example novel', author: 'Author', importedAt: 1,
  originalFileName: 'book.epub', size: 1234, progress: 0, ...changes,
});
const remoteProgress = {
  version: 1, bookId: id, progress: 20, currentChapter: 'Chapter 20',
  currentChapterIndex: 19, currentChapterNumber: 20,
  lastCfi: null, lastOpenedAt: 1_300_000, updatedAt: 1_300_000,
} as const;
const remoteReview = {
  version: 1, bookId: id, rating: 8,
  comments: 'Old cloud notes', shelfStatus: 'trying', updatedAt: 1_300_000,
} as const;

function mockedGateway<T>(value: T, revision = revisionB) {
  const calls: Array<{method: string; body: unknown}> = [];
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method || 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) as unknown : null;
    calls.push({ method, body });
    return new Response(JSON.stringify(method === 'GET'
      ? { value, revision }
      : { saved: true, value: body && (body as {value: T}).value, revision: revisionC }),
      { headers: { 'Content-Type': 'application/json' } });
  }));
  return calls;
}
afterEach(() => vi.unstubAllGlobals());

describe('personal sync client guards against clock-skew and competing offline writes', () => {
  it('retains a truly later offline reading position despite a fast remote clock', async () => {
    const calls = mockedGateway(remoteProgress);
    const local = book({
      progress: 30, currentChapterNumber: 30, currentChapterIndex: 29,
      currentChapter: 'Chapter 30', progressUpdatedAt: 700_000,
      pendingProgressSync: true, progressCloudRevision: revisionA,
    });
    const result = await syncReadingRecord('reader/library', session, id, local);
    expect(result.progress).toBe(30);
    expect(result.pendingProgressSync).toBe(true);
    expect(result.progressSyncConflict?.value?.progress).toBe(20);
    expect(calls.map(c => c.method)).toEqual(['GET']);
  });

  it('preserves an edited review and Trying shelf when cloud has a different revision', async () => {
    const calls = mockedGateway(remoteReview);
    const local = book({
      personalRating: 9, personalReview: 'New offline thoughts',
      shelfStatus: 'trying', personalReviewUpdatedAt: 700_000,
      pendingReviewSync: true, reviewCloudRevision: revisionA,
    });
    const result = await syncReviewRecord('reader/library', session, id, local);
    expect(result.personalRating).toBe(9);
    expect(result.personalReview).toBe('New offline thoughts');
    expect(result.reviewSyncConflict?.value?.comments).toBe('Old cloud notes');
    expect(calls).toHaveLength(1);
  });

  it('keeps legacy version-1 progress when there is no trusted base revision', async () => {
    mockedGateway(remoteProgress);
    const local = book({ progress: 31, progressUpdatedAt: 700_000 });
    const result = await syncReadingRecord('reader/library', session, id, local);
    expect(result.progress).toBe(31);
    expect(result.progressSyncConflict?.revision).toBe(revisionB);
  });

  it('adopts the cloud copy only when the owner requests it', async () => {
    const calls = mockedGateway(remoteProgress);
    const result = await resolveReadingConflict('reader/library', session, id,
      book({ progress: 31, pendingProgressSync: true }), 'cloud');
    expect(result.progress).toBe(20);
    expect(result.pendingProgressSync).toBe(false);
    expect(result.progressCloudRevision).toBe(revisionB);
    expect(calls.map(c => c.method)).toEqual(['GET']);
  });

  it('writes the device review using current remote revision when explicitly chosen', async () => {
    const calls = mockedGateway(remoteReview);
    const result = await resolveReviewConflict('reader/library', session, id,
      book({
        personalRating: 9, personalReview: 'Keep my notes',
        personalReviewUpdatedAt: 700_000, pendingReviewSync: true,
        reviewSyncConflict: { value: remoteReview, revision: revisionB },
      }), 'device');
    expect(result.pendingReviewSync).toBe(false);
    expect(result.reviewCloudRevision).toBe(revisionC);
    expect(calls.map(c => c.method)).toEqual(['GET', 'POST']);
    expect((calls[1].body as {baseRevision: string}).baseRevision).toBe(revisionB);
    expect((calls[1].body as {value: {rating: number}}).value.rating).toBe(9);
  });

  it('recovers hosted progress for a legacy local EPUB ID matched to the same novel', async () => {
    mockedGateway(remoteProgress);
    const local = book({ id: 'b'.repeat(24), progress: 0 });
    const result = await syncReadingRecord('reader/library', session, id, local);
    expect(result.id).toBe(local.id);
    expect(result.progress).toBe(20);
    expect(result.currentChapterNumber).toBe(20);
    expect(result.progressCloudRevision).toBe(revisionB);
  });

  it('retains both revisions when another write races after reading the cloud snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      new Response(JSON.stringify(init?.method === 'POST'
        ? { error: 'Another device changed this record', conflict: true,
            value: { ...remoteReview, rating: 7, comments: 'Racing update' }, revision: revisionC }
        : { value: remoteReview, revision: revisionB }), {
        status: init?.method === 'POST' ? 409 : 200,
        headers: { 'Content-Type': 'application/json' },
      })));
    const local = book({ personalRating: 9, personalReview: 'Keep device notes',
      personalReviewUpdatedAt: 700_000, pendingReviewSync: true,
      reviewCloudRevision: revisionB });
    const result = await syncReviewRecord('reader/library', session, id, local);
    expect(result.personalReview).toBe('Keep device notes');
    expect(result.pendingReviewSync).toBe(true);
    expect(result.reviewSyncConflict?.value?.comments).toBe('Racing update');
    expect(result.reviewSyncConflict?.revision).toBe(revisionC);
  });


  it('does not overwrite an unseen third-device reading edit during conflict resolution', async () => {
    const calls = mockedGateway(remoteProgress, revisionC);
    const local = book({
      progress: 81, progressUpdatedAt: 700_000,
      pendingProgressSync: true, progressCloudRevision: revisionA,
      progressSyncConflict: { value: { ...remoteProgress, progress: 20 }, revision: revisionB },
    });
    const result = await resolveReadingConflict('reader/library', session, id, local, 'device');
    expect(result.progress).toBe(81);
    expect(result.pendingProgressSync).toBe(true);
    expect(result.progressSyncConflict?.revision).toBe(revisionC);
    expect(calls.map(call => call.method)).toEqual(['GET']);
  });

  it('does not overwrite unseen third-device notes, ratings or shelf edits', async () => {
    const calls = mockedGateway(remoteReview, revisionC);
    const local = book({
      personalRating: 10, personalReview: 'Different local note',
      personalReviewUpdatedAt: 700_000, pendingReviewSync: true,
      reviewCloudRevision: revisionA,
      reviewSyncConflict: { value: { ...remoteReview, rating: 6 }, revision: revisionB },
    });
    const result = await resolveReviewConflict('reader/library', session, id, local, 'device');
    expect(result.personalRating).toBe(10);
    expect(result.pendingReviewSync).toBe(true);
    expect(result.reviewSyncConflict?.revision).toBe(revisionC);
    expect(calls.map(call => call.method)).toEqual(['GET']);
  });


  it('retries a transient 503 when fetching progress without duplicating any writes', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({error: 'Rate limit'}), {
        status: 503, headers: {'Content-Type': 'application/json'},
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: remoteProgress, revision: revisionB,
      }), {headers: {'Content-Type': 'application/json'}}));
    vi.stubGlobal('fetch', fetchMock);
    const result = await syncReadingRecord('reader/library', session, id, book());
    expect(result.progress).toBe(20);
    expect(result.progressCloudRevision).toBe(revisionB);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.every(([, options]) => options?.method !== 'POST')).toBe(true);
  });

  it('does not publish an unattended conflicting legacy review even when its timestamp is later', async () => {
    const calls = mockedGateway(remoteReview);
    const result = await syncReviewRecord('reader/library', session, id,
      book({ personalRating: 7, personalReview: 'Old offline notes', personalReviewUpdatedAt: 2_000_000 }));
    expect(result.reviewSyncConflict?.revision).toBe(revisionB);
    expect(calls).toHaveLength(1);
  });
});
