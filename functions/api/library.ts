import { commit, uploadFiles, type CommitOperation } from '@huggingface/hub';
import { hasOwnerGrant } from './owner';
import {
  DATASET_REPO, authorise, attachRenewal, configured, isPrivateDataset,
  privateHeaders, productionOnly, secureResponse, type Bindings,
} from '../_lib/oauth';

/** Only the authenticated HF owner may read or write the one fixed private dataset. */
interface PagesContext { request: Request; env: Bindings & { TAIYOU_OWNER_PASSPHRASE?: string } }
const NO_STORE = privateHeaders;
const FILE_PATH = /^data\/(?:library\.json|personal\/collections\.json|personal\/(?:reviews|progress)\/[0-9a-f]{24}\.json|novels\/[0-9a-f]{24}\/(?:source\.epub|original\.zip|cover\.jpg))$/;
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const MAX_SINGLE_BYTES = 70 * 1024 * 1024;

export function isAllowedDatasetPath(path: unknown): path is string {
  return typeof path === 'string' && FILE_PATH.test(path);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function reject(status: number, message: string): Response {
  return json({ error: message }, status);
}
async function downloadFile(repo: string, path: string, token: string): Promise<Response> {
  const url = 'https://huggingface.co/datasets/' + repo + '/resolve/main/' +
    path.split('/').map(encodeURIComponent).join('/');
  const result = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
  });
  if (result.status === 404) return reject(404, 'File not found');
  if (!result.ok) return reject(502, 'Private dataset file could not be retrieved');
  // Stream bytes; never buffer a book or its original archive in Worker memory.
  const type = path.endsWith('.epub') ? 'application/epub+zip'
    : path.endsWith('.zip') ? 'application/zip'
      : path.endsWith('.jpg') ? 'image/jpeg' : 'application/json; charset=utf-8';
  return new Response(result.body, {
    status: 200, headers: { ...NO_STORE, 'Content-Type': type },
  });
}

async function upload(request: Request, repo: string, token: string): Promise<Response> {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin ||
      request.headers.get('X-Taiyou-Request') !== 'dataset-upload') {
    return reject(403, 'Same-origin upload required');
  }
  const contentType = request.headers.get('Content-Type') || '';
  const length = Number(request.headers.get('Content-Length') || 0);
  if (!contentType.startsWith('multipart/form-data;') || length > MAX_UPLOAD_BYTES) {
    return reject(413, 'Unsupported or oversized upload');
  }
  const data = await request.formData();
  const paths = data.getAll('path');
  const blobs = data.getAll('file');
  const title = data.get('title');
  if (!paths.length || paths.length !== blobs.length || paths.length > 3 ||
      typeof title !== 'string' || !title.length || title.length > 130) {
    return reject(400, 'Invalid upload manifest');
  }
  let total = 0;
  const files: Array<{ path: string; content: File }> = [];
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i];
    const blob = blobs[i];
    if (!isAllowedDatasetPath(path) || !(blob instanceof File) || !blob.size ||
        blob.size > MAX_SINGLE_BYTES) return reject(400, 'Invalid upload file');
    total += blob.size;
    files.push({ path, content: blob });
  }
  if (total > MAX_UPLOAD_BYTES) return reject(413, 'Upload exceeds limit');
  await uploadFiles({
    repo: { type: 'dataset', name: repo },
    accessToken: token,
    files,
    commitTitle: title,
  });
  return json({ saved: true });
}

/** Destructive deletion is server-side, never a reusable general-purpose delete API.
 * One HF commit removes exactly one verified novel's folder, its private notes,
 * and its catalogue entry. parentCommit avoids overwriting concurrent catalogue updates.
 * The dataset's Git history can assist recovery, but users should keep a ZIP backup.
 */
async function deleteHostedNovel(request: Request, token: string, env: PagesContext['env'],
    session: import('../_lib/oauth').OAuthSession): Promise<Response> {
  const url = new URL(request.url);
  if (request.headers.get('Origin') !== url.origin ||
      request.headers.get('X-Taiyou-Request') !== 'owner-delete-novel' ||
      !(await hasOwnerGrant(request, env, session))) {
    return reject(403, 'Owner mode and a valid Hugging Face owner session are required');
  }
  if (!request.headers.get('Content-Type')?.startsWith('application/json') ||
      Number(request.headers.get('Content-Length') || 0) > 1500) {
    return reject(400, 'Expected a small JSON delete request');
  }
  let id = '', title = '';
  try {
    const body = await request.json() as { id?: unknown; title?: unknown };
    if (typeof body.id !== 'string' || !/^[a-f0-9]{24}$/.test(body.id) ||
        typeof body.title !== 'string' || !body.title.trim() || body.title.length > 255) {
      return reject(400, 'Invalid novel ID or title');
    }
    id = body.id; title = body.title;
  } catch { return reject(400, 'Invalid JSON'); }

  const headers = { Authorization: 'Bearer ' + token };
  const base = 'https://huggingface.co';
  const [repoInfo, catalogResponse] = await Promise.all([
    fetch(base + '/api/datasets/' + DATASET_REPO, { headers, cache: 'no-store' }),
    fetch(base + '/datasets/' + DATASET_REPO + '/resolve/main/data/library.json',
      { headers, cache: 'no-store' }),
  ]);
  if (!repoInfo.ok || !catalogResponse.ok) return reject(502, 'Could not verify the private dataset and catalogue');
  const info = await repoInfo.json() as { sha?: unknown };
  if (typeof info.sha !== 'string' || !/^[0-9a-f]{40}$/.test(info.sha)) {
    return reject(502, 'Cannot safely identify the current dataset revision');
  }
  const catalog = await catalogResponse.json() as { version?: unknown; books?: unknown };
  if (catalog.version !== 1 || !Array.isArray(catalog.books) ||
      catalog.books.length > 30000 || catalog.books.some((value: unknown) =>
        !value || typeof value !== 'object' ||
        typeof (value as {id?: unknown}).id !== 'string' ||
        typeof (value as {metadata?: {title?: unknown}}).metadata?.title !== 'string')) {
    return reject(502, 'The remote catalogue cannot be safely modified');
  }
  const books = catalog.books as Array<{id: string; metadata: {title: string}; epubPath: string; archivePath?: string; coverPath?: string}>;
  const target = books.find(entry => entry.id === id);
  if (!target || target.metadata.title !== title) {
    return reject(409, 'Novel ID or title changed. Refresh and try again');
  }
  const folder = 'data/novels/' + id + '/';
  if (target.epubPath !== folder + 'source.epub' ||
      (target.archivePath && target.archivePath !== folder + 'original.zip') ||
      (target.coverPath && target.coverPath !== folder + 'cover.jpg')) {
    return reject(409, 'Unexpected novel storage paths. Deletion cancelled');
  }
  const personalPaths = [
    'data/personal/reviews/' + id + '.json',
    'data/personal/progress/' + id + '.json',
  ];
  const existence = await Promise.all(personalPaths.map(path => fetch(
    base + '/datasets/' + DATASET_REPO + '/resolve/main/' + path, {
      method: 'HEAD', headers, cache: 'no-store',
    })));
  if (existence.some(response => response.status !== 404 && !response.ok)) {
    return reject(502, 'Unable to verify private notes; nothing deleted');
  }
  const operations: CommitOperation[] = [
    { operation: 'addOrUpdate', path: 'data/library.json', content: new Blob([
      JSON.stringify({ ...catalog, books: books.filter(entry => entry.id !== id) }, null, 2) + '\n',
    ], { type: 'application/json' }) },
    { operation: 'delete', path: folder },
    ...personalPaths.filter((_, i) => existence[i].ok).map(path => ({ operation: 'delete' as const, path })),
  ];
  try {
    await commit({
      repo: { type: 'dataset', name: DATASET_REPO }, accessToken: token,
      parentCommit: info.sha, title: 'Owner removed novel: ' + title.slice(0, 85), operations,
    });
    return secureResponse({ deleted: true, id });
  } catch {
    return reject(409, 'Dataset changed or removal failed; refresh and verify before retrying');
  }
}

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  if (!productionOnly(request)) return reject(403, 'Private API restricted to production');
  if (!configured(env)) return reject(503, 'OAuth session encryption is not configured');
  const auth = await authorise(request, env);
  if (!auth) return reject(401, 'Sign in with Hugging Face to connect your private library');

  const token = auth.session.access;
  const respond = (response: Response) => attachRenewal(response, auth);
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  if (request.method === 'GET' && action === 'session') {
    if (!(await isPrivateDataset(token))) return respond(reject(502, 'The private novel dataset is inaccessible'));
    return respond(secureResponse({ connected: true, repo: DATASET_REPO, username: auth.session.username }));
  }
  if (request.method === 'GET' && action === 'info') {
    if (!(await isPrivateDataset(token))) return respond(reject(502, 'The private novel dataset is inaccessible'));
    return respond(secureResponse({ private: true }));
  }
  // HEAD only: confirm a real cloud EPUB exists before allowing its last
  // local downloaded copy to be removed. Catalogue metadata alone is not proof.
  if (request.method === 'GET' && action === 'exists') {
    const path = url.searchParams.get('path');
    if (!path || !/^data\/novels\/[0-9a-f]{24}\/source\.epub$/.test(path)) {
      return respond(reject(400, 'Invalid hosted EPUB path'));
    }
    const upstream = await fetch('https://huggingface.co/datasets/' + DATASET_REPO +
      '/resolve/main/' + path, {
      method: 'HEAD', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    });
    return respond(secureResponse({ exists: upstream.ok }));
  }
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'delete-novel') {
    return respond(await deleteHostedNovel(request, token, env, auth.session));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch { return respond(reject(502, 'Could not write the private dataset')); }
  }
  return respond(reject(404, 'Unknown library API action'));
}
