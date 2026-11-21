import { afterEach, describe, expect, it, vi } from 'vitest';
import { commit } from '@huggingface/hub';
import { personalBulkRequest, personalRequest } from '../functions/_lib/personal';

vi.mock('@huggingface/hub', () => ({ commit: vi.fn() }));
const repo = 'test-owner/disposable-private';
const origin = 'https://isolated.example.test';
const id = 'a'.repeat(24);
const other = 'b'.repeat(24);
const progressPath = 'data/personal/progress/' + id + '.json';
const otherPath = 'data/personal/progress/' + other + '.json';
const reviewPath = 'data/personal/reviews/' + id + '.json';
const statePath = 'data/personal/state.json';
const shaOf = (c: string) => c.repeat(40);
const progress = (bookId: string, value: number) => ({
  version: 1, bookId, progress: value, completedAt: null,
  currentChapter: null, currentChapterIndex: null, currentChapterNumber: null,
  lastCfi: null, lastOpenedAt: null, updatedAt: 1_000,
});
const review = { version: 1, bookId: id, rating: 8, comments: 'Retain all existing notes',
  shelfStatus: 'trying', updatedAt: 900 };
const asResponse = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
let sha = shaOf('a');
let files = new Map<string, string>();
let urls: string[] = [];
let privateRepo = true;
let commitCount = 0;
function fixture(initial: Record<string, unknown> = {}) {
  sha = shaOf('a');
  files = new Map(Object.entries(initial).map(([path, value]) => [path, JSON.stringify(value)]));
  urls = [];
  privateRepo = true;
  commitCount = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url === 'https://huggingface.co/api/datasets/' + repo) {
      return asResponse({ private: privateRepo, sha });
    }
    if (url.includes('/tree/' + sha + '/data/personal?')) {
      return asResponse([...files.keys()].filter(p => p !== statePath)
        .map(path => ({ path, type: 'file' })));
    }
    if (url.includes('/resolve/' + sha + '/')) {
      const path = url.split('/resolve/' + sha + '/')[1];
      const content = files.get(path);
      return content === undefined ? new Response(null, { status: 404 }) :
        new Response(content, { status: 200 });
    }
    throw new Error('Unexpected upstream fetch ' + url);
  }));
  vi.mocked(commit).mockImplementation(async request => {
    if (request.parentCommit !== sha) throw new Error('409 parentCommit conflict');
    commitCount++;
    for (const op of request.operations) {
      if (op.operation === 'addOrUpdate') {
        files.set(op.path, op.content instanceof Blob ? await op.content.text() : String(op.content));
      }
    }
    sha = shaOf(commitCount % 2 ? 'b' : 'c');
    return undefined as never;
  });
}
const json = (value: unknown, status = 200) => asResponse(value, status);
const bulk = (method: 'GET' | 'POST' = 'GET', validOrigin = true) =>
  personalBulkRequest(new Request(origin + '/api/library?action=personal-bulk', {
    method, headers: method === 'POST' && validOrigin ? {
      Origin: origin, 'X-Taiyou-Request': 'personal-sync', 'Content-Type': 'application/json',
    } : {},
    ...(method === 'POST' ? { body: JSON.stringify({ operation: 'bootstrap' }) } : {}),
  }), repo, 'isolated-test-token', json);
const doc = (method: 'GET' | 'PATCH', path: string, baseRevision?: string | null, value?: unknown) =>
  personalRequest(new Request(origin + '/api/library?action=personal' +
    (method === 'GET' ? '&path=' + encodeURIComponent(path) : ''), {
    method, ...(method === 'PATCH' ? {
      headers: { Origin: origin, 'X-Taiyou-Request': 'personal-sync', 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, baseRevision, value }),
    } : {}),
  }), repo, 'isolated-test-token', json);
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('bulk personal-state migration and selective PATCH', () => {
  it('loads only real sidecars in one browser GET, without probing missing novel IDs', async () => {
    fixture({ [progressPath]: progress(id, 32), [reviewPath]: review });
    const response = await bulk();
    expect(response.status).toBe(200);
    const data = await response.json() as { version: number; materialised: boolean;
      records: Record<string, { value: { progress?: number; comments?: string }; revision: string }> };
    expect(data.version).toBe(1);
    expect(data.materialised).toBe(false);
    expect(Object.keys(data.records).sort()).toEqual([progressPath, reviewPath].sort());
    expect(data.records[progressPath].value.progress).toBe(32);
    expect(data.records[reviewPath].value.comments).toBe('Retain all existing notes');
    expect(urls.some(url => url.includes('/resolve/' + sha + '/' + otherPath))).toBe(false);
    expect(urls.filter(url => url.includes('/tree/'))).toHaveLength(1);
    expect(commit).not.toHaveBeenCalled();
  });

  it('bootstrap preserves exact legacy files and future GETs read only one snapshot', async () => {
    fixture({ [progressPath]: progress(id, 41), [reviewPath]: review });
    const previous = new Map(files);
    const result = await bulk('POST');
    expect(result.status).toBe(200);
    expect((await result.json() as { materialised: boolean }).materialised).toBe(true);
    expect(commitCount).toBe(1);
    for (const [path, content] of previous) expect(files.get(path)).toBe(content);
    expect(files.has(statePath)).toBe(true);
    urls = [];
    const next = await bulk();
    expect((await next.json() as { materialised: boolean }).materialised).toBe(true);
    expect(urls.filter(url => url.includes('/tree/'))).toHaveLength(0);
    expect(urls.filter(url => url.includes('/resolve/'))).toHaveLength(1);
    expect((await bulk('POST')).status).toBe(200);
    expect(commitCount).toBe(1);
  });

  it('selective PATCH updates index and legacy sidecar atomically, rejects stale client', async () => {
    fixture({ [progressPath]: progress(id, 10), [reviewPath]: review });
    expect((await bulk('POST')).status).toBe(200);
    const before = await (await doc('GET', progressPath)).json() as {revision: string};
    const saved = await doc('PATCH', progressPath, before.revision, progress(id, 60));
    expect(saved.status).toBe(200);
    expect((await saved.json() as {revision: string}).revision).toMatch(/^[a-f0-9]{64}$/);
    expect((await doc('PATCH', progressPath, before.revision, progress(id, 80))).status).toBe(409);
    const index = JSON.parse(files.get(statePath)!) as {
      version: number; records: Record<string, { value: { progress?: number; comments?: string } }> };
    expect(index.records[progressPath].value.progress).toBe(60);
    expect(index.records[reviewPath].value.comments).toBe('Retain all existing notes');
    expect(JSON.parse(files.get(progressPath)!).progress).toBe(60);
    expect(JSON.parse(files.get(reviewPath)!).rating).toBe(8);
    expect(vi.mocked(commit).mock.calls.at(-1)?.[0].operations.map(op => op.path).sort())
      .toEqual([progressPath, statePath].sort());
  });

  it('allows disjoint edits without confusing an unrelated commit with a same-record conflict', async () => {
    fixture({ [progressPath]: progress(id, 10), [otherPath]: progress(other, 20) });
    expect((await bulk('POST')).status).toBe(200);
    const data = await (await bulk()).json() as { records: Record<string, {revision: string}> };
    let interrupted = false;
    const original = vi.mocked(commit).getMockImplementation()!;
    vi.mocked(commit).mockImplementation(async input => {
      if (!interrupted && input.operations.some(op => op.path === progressPath)) {
        interrupted = true;
        await original({ ...input, operations: [
          { operation: 'addOrUpdate', path: otherPath,
            content: new Blob([JSON.stringify(progress(other, 33))]) },
          { operation: 'addOrUpdate', path: statePath,
            content: new Blob([files.get(statePath)!]) },
        ] } as never);
        throw new Error('409 parentCommit conflict');
      }
      return original(input);
    });
    const result = await doc('PATCH', progressPath, data.records[progressPath].revision, progress(id, 55));
    expect(result.status).toBe(200);
    expect(JSON.parse(files.get(progressPath)!).progress).toBe(55);
    expect(interrupted).toBe(true);
  });

  it('fails closed on broken legacy records, non-private datasets and unauthorised bootstrap', async () => {
    fixture({ [progressPath]: {version: 1,bookId: id,progress: 200} });
    expect((await bulk()).status).toBe(502);
    expect(commit).not.toHaveBeenCalled();
    fixture({ [progressPath]: progress(id, 10) });
    privateRepo = false;
    expect((await bulk('POST')).status).toBe(502);
    expect(commit).not.toHaveBeenCalled();
    privateRepo = true;
    expect((await bulk('POST', false)).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
});
