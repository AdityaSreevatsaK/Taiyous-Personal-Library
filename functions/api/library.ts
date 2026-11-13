import { commit, uploadFiles, type CommitOperation } from '@huggingface/hub';
import { hasOwnerGrant } from './owner';
import { parseNovelFilePath, verifiedNovelFolder } from '../../src/lib/novel-paths';
import {
  CATALOGUE_LIMIT, parseDatasetCatalogue, planAdditiveCatalogueUpload,
  type DatasetCatalogue,
} from '../_lib/catalogue';
import {
  DATASET_REPO, authorise, attachRenewal, configured, isPrivateDataset,
  privateHeaders, productionOnly, secureResponse, type Bindings,
} from '../_lib/oauth';

/** Only the authenticated HF owner may read or write the one fixed private dataset. */
interface PagesContext { request: Request; env: Bindings & { TAIYOU_OWNER_PASSPHRASE?: string } }
const NO_STORE = privateHeaders;
const PERSONAL_OR_CATALOGUE = /^data\/(?:library\.json|personal\/collections\.json|personal\/(?:reviews|progress)\/[a-f0-9]{24}\.json)$/;
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const MAX_SINGLE_BYTES = 70 * 1024 * 1024;

export function isAllowedDatasetPath(path: unknown): path is string {
  return typeof path === 'string' &&
    (PERSONAL_OR_CATALOGUE.test(path) || parseNovelFilePath(path) !== null);
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status, headers: { ...NO_STORE, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function reject(status: number, message: string): Response {
  return json({ error: message }, status);
}
class CatalogueSafetyError extends Error {
  constructor(readonly code: number, message: string) { super(message); }
}
const HF_ORIGIN = 'https://huggingface.co';

/** Query the exact immutable HF commit being validated, never /main. */
async function treeHasFiles(repo: string, sha: string, path: string, token: string): Promise<boolean> {
  const safePath = path.split('/').map(encodeURIComponent).join('/');
  const res = await fetch(HF_ORIGIN + '/api/datasets/' + repo + '/tree/' + sha + '/' + safePath +
    '?recursive=true&limit=1', {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
  });
  if (res.status === 404) return false; // No such tree is genuinely empty.
  if (!res.ok) throw new CatalogueSafetyError(502, 'Cannot verify the private dataset file tree');
  let data: unknown;
  try { data = await res.json(); } catch {
    throw new CatalogueSafetyError(502, 'Unexpected dataset tree response');
  }
  if (!Array.isArray(data)) throw new CatalogueSafetyError(502, 'Unexpected dataset tree response');
  return data.length > 0;
}

/** Missing library.json is empty ONLY when the entire data/ tree is empty. */
async function readCatalogueSnapshot(repo: string, token: string):
  Promise<{ sha: string; catalogue: DatasetCatalogue; isNew: boolean }> {
  const headers = { Authorization: 'Bearer ' + token };
  const meta = await fetch(HF_ORIGIN + '/api/datasets/' + repo, { headers, cache: 'no-store' });
  if (!meta.ok) throw new CatalogueSafetyError(502, 'Could not inspect the private dataset');
  const info = await meta.json() as { sha?: unknown; private?: unknown };
  if (info.private !== true || typeof info.sha !== 'string' ||
      !/^[0-9a-f]{40}$/.test(info.sha)) {
    throw new CatalogueSafetyError(502, 'Dataset is not private or has no valid commit revision');
  }
  const sha = info.sha;
  const response = await fetch(HF_ORIGIN + '/datasets/' + repo +
    '/resolve/' + sha + '/data/library.json', { headers, cache: 'no-store' });
  if (response.status === 404) {
    if (await treeHasFiles(repo, sha, 'data', token)) {
      throw new CatalogueSafetyError(409,
        'Recovery required: dataset contains files but data/library.json is missing. No upload was made.');
    }
    return { sha, catalogue: { version: 1, books: [] }, isNew: true };
  }
  if (!response.ok) throw new CatalogueSafetyError(502, 'Could not inspect the dataset catalogue');
  if (Number(response.headers.get('Content-Length') || 0) > CATALOGUE_LIMIT) {
    throw new CatalogueSafetyError(502, 'Dataset catalogue exceeds the safety limit');
  }
  try {
    const text = await response.text();
    if (text.length > CATALOGUE_LIMIT) throw Error('Oversized catalogue');
    return { sha, catalogue: parseDatasetCatalogue(JSON.parse(text)), isNew: false };
  } catch {
    throw new CatalogueSafetyError(502,
      'Recovery required: dataset catalogue is malformed. No upload was made.');
  }
}

/** Safe add-only uploads preserve existing novel metadata and are revision-bound. */
async function uploadCatalogueAddition(repo: string, token: string,
  files: Array<{path: string; content: File}>, title: string): Promise<Response> {
  const incoming = files.find(file => file.path === 'data/library.json');
  if (!incoming || incoming.content.size > CATALOGUE_LIMIT) {
    return reject(400, 'Novel upload must include a reasonably sized catalogue');
  }
  let proposed: DatasetCatalogue;
  try { proposed = parseDatasetCatalogue(JSON.parse(await incoming.content.text())); }
  catch { return reject(400, 'Invalid uploaded catalogue'); }

  const snapshot = await readCatalogueSnapshot(repo, token);
  let plan: ReturnType<typeof planAdditiveCatalogueUpload>;
  try {
    plan = planAdditiveCatalogueUpload(snapshot.catalogue, proposed, files.map(file => file.path));
  } catch (error) {
    return reject(409, error instanceof Error ? error.message : 'Catalogue update rejected');
  }
  // A missing catalogue may be created only in a genuinely empty data/ tree.
  // Never overwrite unlisted/orphaned data in the intended book folder.
  const plannedBook = plan.next.books.find(book => book.id === plan.novelId)!;
  const directory = verifiedNovelFolder(plannedBook)!;
  if (plan.operation === 'add') {
    // Check the intended directory AND the old ID-only directory. This avoids
    // silently overwriting an orphan when importing during a partial migration.
    const candidates = new Set([directory, 'data/novels/' + plan.novelId]);
    for (const candidate of candidates) {
      if (await treeHasFiles(repo, snapshot.sha, candidate, token)) {
        return reject(409, 'Novel files already exist outside the catalogue; recover before uploading');
      }
    }
  } else {
    const zip = directory + '/original.zip';
    const encodedZip = zip.split('/').map(encodeURIComponent).join('/');
    const res = await fetch(HF_ORIGIN + '/datasets/' + repo + '/resolve/' + snapshot.sha + '/' + encodedZip, {
      method: 'HEAD', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    });
    if (res.status !== 404) {
      return reject(res.ok ? 409 : 502,
        'Cannot safely attach an original ZIP while the remote file exists or cannot be verified');
    }
  }
  const operations: CommitOperation[] = [
    ...files.filter(file => file.path !== 'data/library.json').map(file => ({
      operation: 'addOrUpdate' as const, path: file.path, content: file.content,
    })),
    { operation: 'addOrUpdate', path: 'data/library.json',
      content: new Blob([JSON.stringify(plan.next, null, 2) + '\n'],
        { type: 'application/json' }) },
  ];
  try {
    await commit({
      repo: { type: 'dataset', name: repo }, accessToken: token,
      parentCommit: snapshot.sha, title, operations,
    });
    return json({ saved: true, kind: plan.operation });
  } catch {
    return reject(409, 'The dataset changed during upload or the write failed. Refresh and retry; nothing was replaced.');
  }
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
      : /\.(?:jpg|jpeg)$/.test(path) ? 'image/jpeg'
        : path.endsWith('.png') ? 'image/png'
          : path.endsWith('.webp') ? 'image/webp' : 'application/json; charset=utf-8';
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
  if (new Set(files.map(file => file.path)).size !== files.length) {
    return reject(400, 'Duplicate upload paths are not permitted');
  }
  const hasCatalogue = files.some(file => file.path === 'data/library.json');
  const hasNovelData = files.some(file => file.path.startsWith('data/novels/'));
  // Novel files and the authoritative catalogue must be changed together.
  // Sidecar notes/collections are independent and never carry book files.
  if (hasCatalogue) return uploadCatalogueAddition(repo, token, files, title);
  if (hasNovelData) return reject(403, 'Direct novel-file replacement is not permitted');
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
  // Use the exact same immutable dataset revision for verification AND the
  // conditional commit. Fetching /resolve/main in parallel with HEAD can read
  // an older catalogue under a newer sha and accidentally lose another upload.
  const repoInfo = await fetch(base + '/api/datasets/' + DATASET_REPO,
    { headers, cache: 'no-store' });
  if (!repoInfo.ok) return reject(502, 'Could not verify the private dataset');
  const info = await repoInfo.json() as { sha?: unknown };
  if (typeof info.sha !== 'string' || !/^[0-9a-f]{40}$/.test(info.sha)) {
    return reject(502, 'Cannot safely identify the current dataset revision');
  }
  const revision = info.sha;
  const catalogResponse = await fetch(
    base + '/datasets/' + DATASET_REPO + '/resolve/' + revision + '/data/library.json',
    { headers, cache: 'no-store' },
  );
  if (!catalogResponse.ok) return reject(502, 'Could not verify the private dataset catalogue');
  let catalog: DatasetCatalogue;
  try { catalog = parseDatasetCatalogue(await catalogResponse.json()); }
  catch { return reject(502, 'The remote catalogue cannot be safely modified'); }
  const books = catalog.books;
  const target = books.find(entry => entry.id === id);
  if (!target || target.metadata.title !== title) {
    return reject(409, 'Novel ID or title changed. Refresh and try again');
  }
  // Owner grants never authorise an arbitrary path. Delete only the directory
  // verified by the immutable-ID catalogue, including its optional EPUB, ZIP
  // and all cover variants. Do not infer the folder from the current title.
  const directory = verifiedNovelFolder(target);
  if (!directory) return reject(409, 'Unexpected novel storage paths. Deletion cancelled');
  const folder = directory + '/';
  const personalPaths = [
    'data/personal/reviews/' + id + '.json',
    'data/personal/progress/' + id + '.json',
  ];
  const existence = await Promise.all(personalPaths.map(path => fetch(
    base + '/datasets/' + DATASET_REPO + '/resolve/' + revision + '/' + path, {
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
    const novelFile = parseNovelFilePath(path);
    if (!novelFile || novelFile.fileName !== 'source.epub') {
      return respond(reject(400, 'Invalid hosted EPUB path'));
    }
    const upstream = await fetch('https://huggingface.co/datasets/' + DATASET_REPO +
      '/resolve/main/' + (path as string).split('/').map(encodeURIComponent).join('/'), {
      method: 'HEAD', headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
    });
    return respond(secureResponse({ exists: upstream.ok }));
  }
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    if (path === 'data/library.json') {
      try {
        const snapshot = await readCatalogueSnapshot(DATASET_REPO, token);
        return respond(snapshot.isNew
          ? reject(404, 'New private dataset has no catalogue or novel files yet')
          : json(snapshot.catalogue));
      } catch (error) {
        return respond(error instanceof CatalogueSafetyError
          ? reject(error.code, error.message)
          : reject(502, 'Could not verify the dataset catalogue'));
      }
    }
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'delete-novel') {
    return respond(await deleteHostedNovel(request, token, env, auth.session));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch (error) {
      return respond(error instanceof CatalogueSafetyError
        ? reject(error.code, error.message)
        : reject(502, 'Could not write the private dataset'));
    }
  }
  return respond(reject(404, 'Unknown library API action'));
}
