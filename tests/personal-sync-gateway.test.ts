import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/library';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';
import { commit, uploadFiles } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({ commit: vi.fn(), uploadFiles: vi.fn() }));
const repo = 'AdityaSreevatsaK/Taiyous-Novels';
const id = 'a'.repeat(24);
const progressPath = 'data/personal/progress/' + id + '.json';
const reviewPath = 'data/personal/reviews/' + id + '.json';
const collectionsPath = 'data/personal/collections.json';
const env = { HF_OAUTH_SESSION_KEY: 'ab'.repeat(32) };
const progress = (position: number, updatedAt: number) => ({
  version: 1, bookId: id, progress: position,
  currentChapter: null, currentChapterIndex: null, currentChapterNumber: null,
  lastCfi: null, lastOpenedAt: null, updatedAt,
});
const review = (rating: number, updatedAt: number) => ({
  version: 1, bookId: id, rating, comments: 'notes at ' + rating,
  shelfStatus: null, updatedAt,
});

let sha: string;
let remote: Map<string, string>;
function prepare(files: Record<string, unknown> = {}) {
  sha = 'a'.repeat(40);
  remote = new Map(Object.entries(files).map(([p, v]) => [p, JSON.stringify(v)]));
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://huggingface.co/api/datasets/' + repo) {
      return new Response(JSON.stringify({ private: true, sha }));
    }
    const marker = '/resolve/' + sha + '/';
    if (url.includes(marker)) {
      const path = url.split(marker)[1];
      const value = remote.get(path);
      return value === undefined ? new Response(null, { status: 404 }) : new Response(value);
    }
    throw Error('Unexpected HTTP request: ' + url);
  }));
  vi.mocked(commit).mockImplementation(async (input) => {
    if (input.parentCommit !== sha) throw Error('409 parentCommit conflict');
    for (const op of input.operations) {
      if (op.operation === 'addOrUpdate') {
        const content = op.content instanceof Blob ? await op.content.text() : String(op.content);
        remote.set(op.path, content);
      }
    }
    sha = (sha === 'a'.repeat(40) ? 'b' : 'c').repeat(40);
    return undefined as never;
  });
}
async function request(
  method: 'GET' | 'POST', path: string, baseRevision?: string | null, value?: unknown,
  cookieEnabled = true,
) {
  const headers: Record<string, string> = {};
  if (cookieEnabled) headers.Cookie = (await sessionCookie({
    access: 'hf_' + 'a'.repeat(32), username: 'AdityaSreevatsaK',
    expires: Date.now() + 3600_000,
  }, env)).split(';')[0];
  if (method === 'POST') {
    headers.Origin = PUBLIC_ORIGIN;
    headers['X-Taiyou-Request'] = 'personal-sync';
    headers['Content-Type'] = 'application/json';
  }
  return onRequest({
    request: new Request(PUBLIC_ORIGIN + '/api/library?action=personal' +
      (method === 'GET' ? '&path=' + encodeURIComponent(path) : ''), {
      method, headers, ...(method === 'POST' ?
        { body: JSON.stringify({ path, baseRevision, value }) } : {}),
    }), env,
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('private personal data compare-and-set gateway', () => {
  it('reads existing version-1 progress with an opaque content revision', async () => {
    prepare({ [progressPath]: progress(24, 2_000_000) });
    const res = await request('GET', progressPath);
    expect(res.status).toBe(200);
    const doc = await res.json() as { value: {version: number; progress: number}; revision: string };
    expect(doc.value.version).toBe(1);
    expect(doc.value.progress).toBe(24);
    expect(doc.revision).toMatch(/^[a-f0-9]{64}$/);
  });

  it('does not treat timestamps as ordering when two devices race', async () => {
    prepare({ [progressPath]: progress(10, 1_000_000) });
    const seenA = await (await request('GET', progressPath)).json() as { revision: string };
    const seenB = await (await request('GET', progressPath)).json() as { revision: string };
    const deviceA = await request('POST', progressPath, seenA.revision, progress(20, 1_300_000));
    expect(deviceA.status).toBe(200);
    const deviceBLater = await request('POST', progressPath, seenB.revision, progress(30, 700_000));
    expect(deviceBLater.status).toBe(409);
    const conflict = await deviceBLater.json() as { conflict: boolean; value: {progress: number} };
    expect(conflict.conflict).toBe(true);
    expect(conflict.value.progress).toBe(20);
    expect(JSON.parse(remote.get(progressPath)!).progress).toBe(20);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('preserves concurrent review edits and Trying shelf state', async () => {
    prepare({ [reviewPath]: { ...review(7, 1_300_000), shelfStatus: 'trying' } });
    const seen = await (await request('GET', reviewPath)).json() as { revision: string };
    const written = await request('POST', reviewPath, seen.revision, review(9, 700_000));
    expect(written.status).toBe(200);
    const stale = await request('POST', reviewPath, seen.revision, review(5, 1_900_000));
    expect(stale.status).toBe(409);
    expect(JSON.parse(remote.get(reviewPath)!).rating).toBe(9);
  });

  it('protects collection membership changes and missing-file creation', async () => {
    prepare();
    const initial = await (await request('GET', collectionsPath)).json() as { revision: null; value: null };
    expect(initial).toEqual({ revision: null, value: null });
    const value = { version: 1, collections: [{
      id: 'collection_123', name: 'Series', bookIds: [id], updatedAt: 2,
    }] };
    expect((await request('POST', collectionsPath, null, value)).status).toBe(200);
    const stale = await request('POST', collectionsPath, null, {version: 1, collections: []});
    expect(stale.status).toBe(409);
  });

  it('refuses invalid JSON, wrong book IDs, malformed collections and unchecked writes', async () => {
    prepare();
    expect((await request('POST', progressPath, null, { ...progress(4, 1), bookId: 'b'.repeat(24) })).status).toBe(400);
    expect((await request('POST', collectionsPath, null, { version: 1, collections: [{ id: 'bad' }] })).status).toBe(400);
    expect((await request('POST', progressPath, undefined, progress(4, 1))).status).toBe(400);
    expect((await request('GET', progressPath, undefined, undefined, false)).status).toBe(401);
    expect(commit).not.toHaveBeenCalled();
  });

  it('fails closed rather than publishing when the private dataset read fails', async () => {
    prepare();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    expect((await request('POST', progressPath, null, progress(4, 1))).status).toBe(502);
    expect(commit).not.toHaveBeenCalled();
  });
});
