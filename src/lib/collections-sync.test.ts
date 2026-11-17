import { afterEach, describe, expect, it, vi } from 'vitest';
import { equivalentCollections, reconcileCollections, resolveCollections } from './collections-sync';
import type { CloudSession } from './cloud';
import type { BookCollection } from './collections';

const session: CloudSession = {
  username: 'Test', accessToken: '', expiresAt: Number.MAX_SAFE_INTEGER, via: 'oauth',
};
const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
const original: BookCollection = {
  id: 'collection_123', name: 'Favourites', bookIds: ['a'.repeat(24)], updatedAt: 200,
};
const newer: BookCollection = {
  id: original.id, name: 'Changed remotely', bookIds: ['b'.repeat(24)], updatedAt: 100,
};

function stubCloud(remote: BookCollection[], revision = c) {
  const calls: Array<{method: string; body: unknown}> = [];
  vi.stubGlobal('fetch', vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ method, body: init?.body ? JSON.parse(String(init.body)) as unknown : null });
    return new Response(JSON.stringify(method === 'GET'
      ? { revision, value: {version: 1, collections: remote} }
      : { revision: a, value: (init?.body ? JSON.parse(String(init.body)) : {}).value }),
      { headers: {'Content-Type': 'application/json'} });
  }));
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('revision-aware collection synchronisation', () => {
  it('ignores different client timestamps when membership is causally conflicting', async () => {
    const calls = stubCloud([newer]);
    const outcome = await reconcileCollections('reader/library', session, [original], true, a, null);
    expect(outcome.pending).toBe(true);
    expect(outcome.collections).toEqual([original]);
    expect(outcome.conflict?.remote).toEqual([newer]);
    expect(calls.map(x => x.method)).toEqual(['GET']);
  });

  it('will not overwrite a newly changed cloud membership that the user has not yet reviewed', async () => {
    const calls = stubCloud([newer], c);
    const outcome = await resolveCollections(
      'reader/library', session, [original], 'device',
      { remote: [{ ...newer, name: 'Previous cloud edit' }], revision: b },
    );
    expect(outcome.collections).toEqual([original]);
    expect(outcome.conflict?.revision).toBe(c);
    expect(outcome.pending).toBe(true);
    expect(calls.map(x => x.method)).toEqual(['GET']);
  });

  it('still permits choosing the latest cloud version without writing', async () => {
    const calls = stubCloud([newer]);
    const outcome = await resolveCollections(
      'reader/library', session, [original], 'cloud',
      { remote: [{ ...newer, name: 'Previous cloud edit' }], revision: b },
    );
    expect(outcome.collections).toEqual([newer]);
    expect(outcome.pending).toBe(false);
    expect(calls.map(x => x.method)).toEqual(['GET']);
  });

  it('preserves collection tombstones in semantic comparisons', () => {
    const deleted = [{ ...original, deleted: true }];
    const active = [{ ...original, deleted: false }];
    expect(equivalentCollections(deleted, active)).toBe(false);
  });

  it('retains local collections if the private cloud is temporarily unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Network unavailable'); }));
    await expect(reconcileCollections('reader/library', session, [original], true, a, null))
      .rejects.toThrow('Network unavailable');
    expect(original.name).toBe('Favourites');
  });
});
