import { commit } from '@huggingface/hub';

/**
 * The version-1 JSON documents remain byte-for-byte compatible with the
 * Storage Controller. Only the transport uses an opaque content revision.
 * A client's wall clock is never an ordering or overwrite authority.
 */
const ORIGIN = 'https://huggingface.co';
const MAX_DOCUMENT_BYTES = 640 * 1024;
const PERSONAL_PATH = /^data\/personal\/(?:collections\.json|(?:progress|reviews)\/[0-9a-f]{24}\.json)$/;
const VALID_ID = /^[0-9a-f]{24}$/;
const VALID_COLLECTION_ID = /^[a-zA-Z0-9_-]{8,100}$/;
const HASH = /^[0-9a-f]{64}$/;
type Snapshot = { revision: string | null; value: unknown | null };
type ResponseFactory = (value: unknown, status?: number) => Response;

function validDocument(path: string, value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1) return false;
  if (path.endsWith('/collections.json')) {
    if (!Array.isArray(v.collections) || v.collections.length > 500) return false;
    const seen = new Set<string>();
    for (const item of v.collections) {
      if (!item || typeof item !== 'object') return false;
      const c = item as Record<string, unknown>;
      if (typeof c.id !== 'string' || !VALID_COLLECTION_ID.test(c.id) || seen.has(c.id) ||
          typeof c.name !== 'string' || !c.name.trim() || c.name.length > 90 ||
          !Array.isArray(c.bookIds) || c.bookIds.length > 2000 ||
          c.bookIds.some(id => typeof id !== 'string' || !VALID_ID.test(id)) ||
          typeof c.updatedAt !== 'number' || !Number.isFinite(c.updatedAt) || c.updatedAt < 0 ||
          (c.deleted !== undefined && typeof c.deleted !== 'boolean')) return false;
      seen.add(c.id);
    }
    return true;
  }
  const id = path.split('/').at(-1)?.slice(0, 24);
  if (v.bookId !== id || !VALID_ID.test(String(v.bookId))) return false;
  if (path.includes('/reviews/')) {
    return (v.rating === null ||
      (typeof v.rating === 'number' && Number.isInteger(v.rating) && v.rating >= 1 && v.rating <= 10)) &&
      typeof v.comments === 'string' && v.comments.length <= 10000 &&
      (v.shelfStatus === undefined || v.shelfStatus === null || v.shelfStatus === 'trying') &&
      typeof v.updatedAt === 'number' && Number.isFinite(v.updatedAt) && v.updatedAt >= 0;
  }
  const text = (x: unknown, limit: number) => x === null || (typeof x === 'string' && x.length <= limit);
  const integer = (x: unknown) => x === null || (typeof x === 'number' && Number.isSafeInteger(x) && x >= 0);
  return typeof v.progress === 'number' && Number.isFinite(v.progress) && v.progress >= 0 && v.progress <= 100 &&
    text(v.currentChapter, 600) && text(v.lastCfi, 4000) &&
    integer(v.currentChapterIndex) && integer(v.currentChapterNumber) &&
    integer(v.lastOpenedAt) && integer(v.updatedAt) && v.updatedAt !== null;
}

async function contentRevision(bytes: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}

async function snapshot(repo: string, token: string, path: string): Promise<{sha: string; record: Snapshot}> {
  const headers = { Authorization: 'Bearer ' + token };
  const meta = await fetch(ORIGIN + '/api/datasets/' + repo, { headers, cache: 'no-store' });
  if (!meta.ok) throw new Error('Unable to inspect private dataset revision');
  const info = await meta.json() as { sha?: unknown; private?: unknown };
  if (info.private !== true || typeof info.sha !== 'string' || !/^[0-9a-f]{40}$/.test(info.sha)) {
    throw new Error('Dataset privacy or revision could not be verified');
  }
  const response = await fetch(ORIGIN + '/datasets/' + repo + '/resolve/' + info.sha + '/' + path,
    { headers, cache: 'no-store' });
  if (response.status === 404) return { sha: info.sha, record: { value: null, revision: null } };
  if (!response.ok || Number(response.headers.get('Content-Length') || 0) > MAX_DOCUMENT_BYTES) {
    throw new Error('Cannot safely read private personal data');
  }
  const raw = await response.text();
  if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) throw new Error('Private personal document is too large');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Private personal document is malformed'); }
  if (!validDocument(path, value)) throw new Error('Private personal document has invalid fields');
  return { sha: info.sha, record: { value, revision: await contentRevision(raw) } };
}

/**
 * All mutation checks happen on the server against an immutable HF dataset
 * revision, then commit(parentCommit). A changed target is returned as a 409
 * instead of being overwritten. An unrelated commit can be safely retried.
 */
export async function personalRequest(
  request: Request, repo: string, token: string, json: ResponseFactory,
): Promise<Response> {
  const url = new URL(request.url);
  let path: unknown;
  let expected: unknown;
  let value: unknown;
  if (request.method === 'GET') {
    path = url.searchParams.get('path');
  } else if (request.method === 'POST') {
    if (request.headers.get('Origin') !== url.origin ||
        request.headers.get('X-Taiyou-Request') !== 'personal-sync') {
      return json({ error: 'Same-origin personal sync is required' }, 403);
    }
    if (Number(request.headers.get('Content-Length') || 0) > MAX_DOCUMENT_BYTES) {
      return json({ error: 'Personal sync request too large' }, 413);
    }
    const raw = await request.text();
    if (new TextEncoder().encode(raw).length > MAX_DOCUMENT_BYTES) {
      return json({ error: 'Personal sync request too large' }, 413);
    }
    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return json({ error: 'Invalid personal sync request' }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch { return json({ error: 'Invalid personal sync request' }, 400); }
    path = body.path;
    expected = body.baseRevision;
    value = body.value;
    if (!Object.prototype.hasOwnProperty.call(body, 'baseRevision') ||
        !(expected === null || (typeof expected === 'string' && HASH.test(expected)))) {
      return json({ error: 'A valid base revision is required' }, 400);
    }
  } else return json({ error: 'Unsupported method' }, 405);

  if (typeof path !== 'string' || !PERSONAL_PATH.test(path)) {
    return json({ error: 'Invalid personal sync path' }, 400);
  }
  if (request.method === 'POST' && !validDocument(path, value)) {
    return json({ error: 'Invalid private document' }, 400);
  }
  try {
    if (request.method === 'GET') return json((await snapshot(repo, token, path)).record);
    const content = JSON.stringify(value, null, 2) + '\n';
    if (new TextEncoder().encode(content).length > MAX_DOCUMENT_BYTES) {
      return json({ error: 'Personal document too large' }, 413);
    }
    const revision = await contentRevision(content);
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await snapshot(repo, token, path);
      if (current.record.revision !== expected) {
        return json({ error: 'Another device changed this record', conflict: true, ...current.record }, 409);
      }
      try {
        await commit({
          repo: { type: 'dataset', name: repo }, accessToken: token,
          parentCommit: current.sha, title: 'Sync private personal data',
          operations: [{ operation: 'addOrUpdate', path, content: new Blob([content], { type: 'application/json' }) }],
        });
        return json({ saved: true, value, revision });
      } catch (error) {
        // Do not retry an arbitrary storage failure. Only optimistic-concurrency
        // errors can be retried against the freshly inspected target.
        if (!/409|412|parent.commit|revision|conflict/i.test(String(error))) {
          return json({ error: 'Private personal data could not be saved' }, 502);
        }
      }
    }
    return json({ error: 'The dataset changed repeatedly. Refresh and retry without discarding local edits.' }, 409);
  } catch {
    return json({ error: 'Private sync state could not be verified; local changes were not discarded' }, 502);
  }
}
