import { afterEach, describe, expect, it, vi } from 'vitest';
import { commit } from '@huggingface/hub';
import { personalRequest } from '../functions/_lib/personal';

vi.mock('@huggingface/hub', () => ({ commit: vi.fn() }));
const repo = 'test-owner/isolated-private';
const id = 'a'.repeat(24);
const path = 'data/personal/progress/' + id + '.json';
const baseUrl = 'https://isolated.example.test/api/library?action=personal';
const progress = (value: number, timestamp: number) => ({
  version: 1, bookId: id, progress: value, completedAt: null,
  currentChapter: null, currentChapterIndex: null, currentChapterNumber: null,
  lastCfi: null, lastOpenedAt: null, updatedAt: timestamp,
});
let sha = 'a'.repeat(40);
let cloud = new Map<string, string>();

function privateHub(initial: Record<string, unknown> = {}) {
  sha = 'a'.repeat(40);
  cloud = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://huggingface.co/api/datasets/' + repo) {
      return new Response(JSON.stringify({ private: true, sha }));
    }
    const marker = '/resolve/' + sha + '/';
    if (url.includes(marker)) {
      const entry = cloud.get(url.split(marker)[1]);
      return entry === undefined ? new Response(null, { status: 404 }) : new Response(entry);
    }
    throw new Error('Unexpected private-Hub request in fixture');
  }));
  vi.mocked(commit).mockImplementation(async input => {
    if (input.parentCommit !== sha) throw new Error('409 parentCommit mismatch');
    for (const op of input.operations) {
      if (op.operation === 'addOrUpdate') {
        const content = op.content instanceof Blob ? await op.content.text() : String(op.content);
        cloud.set(op.path, content);
      }
    }
    sha = (sha[0] === 'a' ? 'b' : 'c').repeat(40);
    return undefined as never;
  });
}

function endpoint(method: 'GET' | 'POST', expected?: string | null, value?: unknown, validHeaders = true) {
  const headers: Record<string, string> = {};
  if (method === 'POST' && validHeaders) {
    headers.Origin = 'https://isolated.example.test';
    headers['X-Taiyou-Request'] = 'personal-sync';
    headers['Content-Type'] = 'application/json';
  }
  const request = new Request(baseUrl + (method === 'GET' ? '&path=' + encodeURIComponent(path) : ''), {
    method, headers, ...(method === 'POST' ? { body: JSON.stringify({ path, baseRevision: expected, value }) } : {}),
  });
  return personalRequest(request, repo, 'synthetic-test-token',
    (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('isolated compare-and-set transport foundation (Issue #34)', () => {
  it('provides a content revision for legacy v1 documents', async () => {
    privateHub({ [path]: progress(14, 1000) });
    const result = await endpoint('GET');
    expect(result.status).toBe(200);
    const body = await result.json() as { revision: string; value: { progress: number } };
    expect(body.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(body.value.progress).toBe(14);
  });
  it('refuses a stale update even when its device timestamp is newer', async () => {
    privateHub({ [path]: progress(10, 1000) });
    const first = await (await endpoint('GET')).json() as { revision: string };
    const a = await endpoint('POST', first.revision, progress(20, 800));
    expect(a.status).toBe(200);
    const stale = await endpoint('POST', first.revision, progress(30, 2000));
    expect(stale.status).toBe(409);
    const conflict = await stale.json() as { conflict: boolean; value: { progress: number } };
    expect(conflict.conflict).toBe(true);
    expect(conflict.value.progress).toBe(20);
    expect(commit).toHaveBeenCalledTimes(1);
  });
  it('refuses unchecked writes, invalid paths and cross-origin mutations', async () => {
    privateHub();
    expect((await endpoint('POST', undefined, progress(20, 1))).status).toBe(400);
    expect((await endpoint('POST', null, progress(20, 1), false)).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
  it('does not write when the dataset is inaccessible or no longer private', async () => {
    privateHub();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ private: false, sha }))));
    const result = await endpoint('POST', null, progress(10, 1));
    expect(result.status).toBe(502);
    expect(commit).not.toHaveBeenCalled();
  });
});
