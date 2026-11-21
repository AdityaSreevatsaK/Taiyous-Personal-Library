/** Real private HF integration. Skipped during normal CI.
 * Only the opt-in disposable workflow supplies both variables. */
import { describe, expect, it } from 'vitest';
import { personalBulkRequest, personalRequest } from '../functions/_lib/personal';

const repo = process.env.HF_REAL_TEST_REPO ?? '';
const token = process.env.HF_DISPOSABLE_TEST_TOKEN ?? '';
const safe = /\/taiyou-disposable-sync-[a-f0-9]{10}$/.test(repo) &&
  repo !== 'AdityaSreevatsaK/Taiyous-Novels' && token.startsWith('hf_');
const origin = 'https://isolated.example.test';
const id = 'a'.repeat(24);
const progressPath = 'data/personal/progress/' + id + '.json';
const reviewPath = 'data/personal/reviews/' + id + '.json';
const collectionPath = 'data/personal/collections.json';
const out = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
});
const bulk = (method: 'GET' | 'POST') => personalBulkRequest(
  new Request(origin + '/api/library?action=personal-bulk', {
    method, ...(method === 'POST' ? {
      headers: { Origin: origin, 'X-Taiyou-Request': 'personal-sync',
        'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'bootstrap' }),
    } : {}),
  }), repo, token, out,
);
const read = (path: string) => personalRequest(
  new Request(origin + '/api/library?action=personal&path=' + encodeURIComponent(path)),
  repo, token, out,
);
const patch = (path: string, revision: string | null, value: unknown) =>
  personalRequest(new Request(origin + '/api/library?action=personal', {
    method: 'PATCH', headers: { Origin: origin, 'X-Taiyou-Request': 'personal-sync',
      'Content-Type': 'application/json' },
    body: JSON.stringify({ path, baseRevision: revision, value }),
  }), repo, token, out,
);
async function pinnedOriginal(path: string) {
  const infoRes = await fetch('https://huggingface.co/api/datasets/' + repo, {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect(infoRes.status).toBe(200);
  const info = await infoRes.json() as { sha: string; private: boolean };
  expect(info.private).toBe(true);
  const dataRes = await fetch('https://huggingface.co/datasets/' + repo +
    '/resolve/' + info.sha + '/' + path, {
    headers: { Authorization: 'Bearer ' + token },
  });
  expect(dataRes.status).toBe(200);
  return dataRes.text();
}

describe.skipIf(!safe)('real isolated HF index and CAS protocol', () => {
  it('losslessly migrates only present records and PATCHes without overwriting races', async () => {
    const originals = new Map<string, string>();
    for (const path of [progressPath, reviewPath, collectionPath]) {
      originals.set(path, await pinnedOriginal(path));
    }
    const first = await bulk('GET');
    expect(first.status).toBe(200);
    const initial = await first.json() as {
      materialised: boolean; version: number; records: Record<string, { revision: string }> };
    expect(initial.materialised).toBe(false);
    expect(initial.version).toBe(1);
    expect(Object.keys(initial.records).sort()).toEqual([...originals.keys()].sort());

    const migration = await bulk('POST');
    expect(migration.status).toBe(200);
    expect((await migration.json() as {materialised: boolean}).materialised).toBe(true);
    for (const [path, original] of originals) {
      expect(await pinnedOriginal(path)).toBe(original);
    }
    const snapshot = await bulk('GET');
    expect(snapshot.status).toBe(200);
    expect((await snapshot.json() as {materialised: boolean}).materialised).toBe(true);
    const seen = await (await read(progressPath)).json() as {
      revision: string; value: { progress: number } };
    expect(seen.revision).toMatch(/^[a-f0-9]{64}$/);

    const value = {
      version: 1, bookId: id, progress: 79, completedAt: null,
      currentChapter: 'Chapter 79', currentChapterIndex: 78,
      currentChapterNumber: 79, lastCfi: null,
      lastOpenedAt: 9300, updatedAt: 9300,
    };
    const approved = await patch(progressPath, seen.revision, value);
    expect(approved.status).toBe(200);
    const ignored = await patch(progressPath, seen.revision, { ...value, progress: 94 });
    expect(ignored.status).toBe(409);
    expect((await ignored.json() as {conflict: boolean}).conflict).toBe(true);
    const verified = await bulk('GET');
    const state = await verified.json() as {records: Record<string, { value: { progress?: number }; revision: string }>};
    expect(state.records[progressPath].value.progress).toBe(79);
    expect(state.records[progressPath].revision).not.toBe(seen.revision);
    expect(await pinnedOriginal(reviewPath)).toBe(originals.get(reviewPath));
    expect(await pinnedOriginal(collectionPath)).toBe(originals.get(collectionPath));
    expect(JSON.parse(await pinnedOriginal(progressPath)).progress).toBe(79);
  }, 90_000);
});
