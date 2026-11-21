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
          (c.parentId !== undefined && (typeof c.parentId !== 'string' || !VALID_COLLECTION_ID.test(c.parentId) || c.parentId === c.id)) ||
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
    integer(v.lastOpenedAt) && integer(v.updatedAt) && v.updatedAt !== null &&
    (v.completedAt === undefined || integer(v.completedAt));
}

async function contentRevision(bytes: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bytes));
  return [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, '0')).join('');
}


/** A compact private, immutable-revision materialised view. Existing per-book
 * files remain untouched as recoverable legacy copies. Normal GETs never
 * probe missing individual IDs. */
const INDEX_PATH = 'data/personal/state.json';
const INDEX_LIMIT = 8 * 1024 * 1024;
const TREE_LIMIT = 1000;
const LEGACY_LIMIT = 950;
export type PersonalSnapshot = { value: unknown | null; revision: string | null };
export interface PersonalState {
  version: 1;
  records: Record<string, PersonalSnapshot>;
}
type CurrentState = { sha: string; materialised: boolean; data: PersonalState };
const encoder = new TextEncoder();

async function datasetRevision(repo: string, token: string): Promise<string> {
  const response = await fetch(ORIGIN + '/api/datasets/' + repo, {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
  });
  if (!response.ok) throw new Error('Unable to inspect private dataset');
  const info = await response.json() as { private?: unknown; sha?: unknown };
  if (info.private !== true || typeof info.sha !== 'string' || !/^[0-9a-f]{40}$/.test(info.sha)) {
    throw new Error('Private dataset revision cannot be verified');
  }
  return info.sha;
}

async function pinnedFile(repo: string, token: string, sha: string, path: string): Promise<Response> {
  const response = await fetch(ORIGIN + '/datasets/' + repo + '/resolve/' + sha + '/' + path, {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
  });
  return response;
}

function validateState(value: unknown): PersonalState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid personal-state index');
  const index = value as Record<string, unknown>;
  if (index.version !== 1 || !index.records || typeof index.records !== 'object' || Array.isArray(index.records)) {
    throw new Error('Unsupported personal-state index');
  }
  const records = Object.create(null) as Record<string, PersonalSnapshot>;
  for (const [path, item] of Object.entries(index.records as Record<string, unknown>)) {
    if (!PERSONAL_PATH.test(path) || !item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error('Invalid personal-state record key');
    }
    const record = item as Record<string, unknown>;
    if (typeof record.revision !== 'string' || !HASH.test(record.revision) ||
        !validDocument(path, record.value)) {
      throw new Error('Malformed personal-state record');
    }
    records[path] = { value: record.value, revision: record.revision };
    if (Object.keys(records).length > LEGACY_LIMIT) throw new Error('Personal-state index is too large');
  }
  return { version: 1, records };
}

async function readLegacyRecords(repo: string, token: string, sha: string): Promise<PersonalState> {
  const url = ORIGIN + '/api/datasets/' + repo + '/tree/' + sha + '/data/personal' +
    '?recursive=true&limit=' + TREE_LIMIT;
  // HF's tree listing is cursor-paginated. Follow every authenticated page
  // at the *same immutable revision*; an incomplete enumeration must never
  // be materialised as an authoritative index.
  let nextUrl: string | null = url;
  const visited = new Set<string>();
  const pathsFound: string[] = [];
  let totalEntries = 0;
  while (nextUrl) {
    if (visited.has(nextUrl) || visited.size > 20) throw new Error('Personal-data pagination cycle detected');
    visited.add(nextUrl);
    const tree = await fetch(nextUrl, {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    });
    if (tree.status === 404 && visited.size === 1) {
      return { version: 1, records: Object.create(null) };
    }
    if (!tree.ok) throw new Error('Cannot list existing private personal documents');
    const listing: unknown = await tree.json();
    if (!Array.isArray(listing)) throw new Error('Invalid personal-data directory listing');
    totalEntries += listing.length;
    if (totalEntries > LEGACY_LIMIT) {
      throw new Error('Personal-data tree exceeds safe migration limit; no files were changed.');
    }
    for (const row of listing) {
      if (row && typeof row === 'object' && typeof row.path === 'string' &&
          (row.type === 'file' || row.type === 'blob') && PERSONAL_PATH.test(row.path)) {
        pathsFound.push(row.path);
      }
    }
    const linkHeader = tree.headers.get('Link') ?? '';
    const nextLink = linkHeader.match(/<([^>]+)>;\\s*rel="?next"?/i);
    if (!nextLink) {
      // If exactly the server's maximum page size arrived without a next
      // link, assume truncation rather than silently losing private records.
      if (listing.length >= TREE_LIMIT) throw new Error('Incomplete personal-data tree listing');
      nextUrl = null;
    } else {
      const continuation = new URL(nextLink[1], ORIGIN);
      const expected = new URL(url);
      if (continuation.origin !== ORIGIN || continuation.pathname !== expected.pathname ||
          continuation.searchParams.get('recursive') !== 'true') {
        throw new Error('Unsafe or incomplete personal-data pagination link');
      }
      nextUrl = continuation.href;
    }
  }
  const paths = [...new Set(pathsFound)];
  if (paths.length > LEGACY_LIMIT) throw new Error('Too many private personal documents');
  const records = Object.create(null) as Record<string, PersonalSnapshot>;
  let next = 0;
  let total = 0;
  const workers = Array.from({ length: Math.min(8, paths.length) }, async () => {
    while (next < paths.length) {
      const path = paths[next++];
      const response = await pinnedFile(repo, token, sha, path);
      if (!response.ok || Number(response.headers.get('Content-Length') || 0) > MAX_DOCUMENT_BYTES) {
        throw new Error('Unable to safely preserve an existing personal file: ' + path);
      }
      const raw = await response.text();
      const bytes = encoder.encode(raw).byteLength;
      if (bytes > MAX_DOCUMENT_BYTES) throw new Error('Private personal document exceeds limit');
      total += bytes;
      if (total > INDEX_LIMIT) throw new Error('Private data exceeds snapshot safety limit');
      let value: unknown;
      try { value = JSON.parse(raw); } catch { throw new Error('Private personal document is malformed'); }
      if (!validDocument(path, value)) throw new Error('Existing private record failed validation: ' + path);
      records[path] = { value, revision: await contentRevision(raw) };
    }
  });
  await Promise.all(workers);
  return { version: 1, records };
}

async function loadState(repo: string, token: string, sha: string): Promise<CurrentState> {
  const response = await pinnedFile(repo, token, sha, INDEX_PATH);
  if (response.status === 404) {
    return { sha, materialised: false, data: await readLegacyRecords(repo, token, sha) };
  }
  if (!response.ok || Number(response.headers.get('Content-Length') || 0) > INDEX_LIMIT) {
    throw new Error('Cannot safely read private personal-state index');
  }
  const raw = await response.text();
  if (encoder.encode(raw).byteLength > INDEX_LIMIT) throw new Error('Private personal-state index is too large');
  let jsonValue: unknown;
  try { jsonValue = JSON.parse(raw); } catch { throw new Error('Private personal-state index is malformed'); }
  return { sha, materialised: true, data: validateState(jsonValue) };
}

function stateBody(data: PersonalState): string {
  const content = JSON.stringify(data) + '\n';
  if (encoder.encode(content).byteLength > INDEX_LIMIT) throw new Error('Private index exceeds limit');
  return content;
}

function atPath(data: PersonalState, path: string): Snapshot {
  return data.records[path] ?? { value: null, revision: null };
}

/** Bulk read is ONE browser request, not two speculative GETs per novel.
 * Initial migration enumerates ONLY actual, existing sidecars. Later loads
 * read a single materialised index at a pinned HF revision. */
export async function personalBulkRequest(
  request: Request, repo: string, token: string, json: ResponseFactory,
): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return json({ error: 'Unsupported method' }, 405);
  }
  if (request.method === 'POST') {
    const origin = new URL(request.url).origin;
    if (request.headers.get('Origin') !== origin ||
        request.headers.get('X-Taiyou-Request') !== 'personal-sync') {
      return json({ error: 'Same-origin migration request required' }, 403);
    }
    if (Number(request.headers.get('Content-Length') || '0') > 128) return json({ error: 'Invalid migration request' }, 413);
    const raw = await request.text();
    let data: unknown;
    try { data = JSON.parse(raw); } catch { return json({ error: 'Invalid migration request' }, 400); }
    if (!data || typeof data !== 'object' || (data as Record<string, unknown>).operation !== 'bootstrap') {
      return json({ error: 'Unsupported personal-state operation' }, 400);
    }
  }
  try {
    const sha = await datasetRevision(repo, token);
    const state = await loadState(repo, token, sha);
    if (request.method === 'GET' || state.materialised) {
      return json({ ...state.data, materialised: state.materialised });
    }
    // One-time non-destructive migration. The old per-novel files remain
    // available for recovery and the parent revision guards concurrent writes.
    await commit({
      repo: { type: 'dataset', name: repo }, accessToken: token, parentCommit: sha,
      title: 'Create private personal-state index',
      operations: [{ operation: 'addOrUpdate', path: INDEX_PATH,
        content: new Blob([stateBody(state.data)], { type: 'application/json' }) }],
    });
    return json({ ...state.data, materialised: true });
  } catch (error) {
    const message = String(error);
    return json({ error: /parent.commit|409|412|conflict/i.test(message)
      ? 'Personal state changed during migration. Refresh and retry; legacy records were retained.'
      : 'Personal-state migration/read could not be verified. Existing files were not changed.' },
    /parent.commit|409|412|conflict/i.test(message) ? 409 : 502);
  }
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
  } else if (request.method === 'POST' || request.method === 'PATCH') {
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
    if (request.method === 'GET') {
      const sha = await datasetRevision(repo, token);
      const state = await loadState(repo, token, sha);
      return json(atPath(state.data, path));
    }
    const content = JSON.stringify(value, null, 2) + '\n';
    if (encoder.encode(content).byteLength > MAX_DOCUMENT_BYTES) {
      return json({ error: 'Personal document too large' }, 413);
    }
    const revision = await contentRevision(content);
    for (let attempt = 0; attempt < 3; attempt++) {
      const sha = await datasetRevision(repo, token);
      const state = await loadState(repo, token, sha);
      const current = atPath(state.data, path);
      if (current.revision !== expected) {
        // Idempotent recovery after an ambiguous successful commit is safe.
        if (current.revision === revision) return json({ saved: true, value, revision });
        return json({ error: 'Another device changed this record', conflict: true, ...current }, 409);
      }
      const records = { ...state.data.records, [path]: { value, revision } };
      const indexed = stateBody({ version: 1, records });
      try {
        // An atomic CAS commit updates both the fast index and original sidecar.
        // Older clients cannot write individual sidecars through the old route.
        await commit({
          repo: { type: 'dataset', name: repo }, accessToken: token,
          parentCommit: sha, title: 'Sync private personal data',
          operations: [
            { operation: 'addOrUpdate', path,
              content: new Blob([content], { type: 'application/json' }) },
            { operation: 'addOrUpdate', path: INDEX_PATH,
              content: new Blob([indexed], { type: 'application/json' }) },
          ],
        });
        return json({ saved: true, value, revision });
      } catch (error) {
        if (!/409|412|parent.commit|revision|conflict/i.test(String(error))) {
          return json({ error: 'Private personal data could not be saved; local changes were retained' }, 502);
        }
      }
    }
    return json({ error: 'Dataset changed repeatedly; refresh without discarding local edits' }, 409);
  } catch {
    return json({ error: 'Private sync state could not be verified; local changes were not discarded' }, 502);
  }
}
