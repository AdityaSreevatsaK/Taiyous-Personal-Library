import { uploadFiles } from '@huggingface/hub';
import {
  DATASET_REPO, authorise, attachRenewal, configured, isPrivateDataset,
  privateHeaders, productionOnly, secureResponse, type Bindings,
} from '../_lib/oauth';

/** Only the authenticated HF owner may read or write the one fixed private dataset. */
interface PagesContext { request: Request; env: Bindings }
const NO_STORE = privateHeaders;
const BOOK_ID = '[0-9a-f]{24}';
const FILE_PATH = new RegExp(
  '^(?:data/library\\.json|data/personal/collections\\.json|' +
  'data/personal/(?:reviews|progress)/' + BOOK_ID + '\\.json|' +
  'data/novels/' + BOOK_ID + '/(?:source\\.epub|original\\.zip|cover\\.jpg))
);
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
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch { return respond(reject(502, 'Could not write the private dataset')); }
  }
  return respond(reject(404, 'Unknown library API action'));
}
,
);
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
    : path.endsWith('.zip') ? 'application/zip' : 'application/json; charset=utf-8';
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
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch { return respond(reject(502, 'Could not write the private dataset')); }
  }
  return respond(reject(404, 'Unknown library API action'));
}

);
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
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch { return respond(reject(502, 'Could not write the private dataset')); }
  }
  return respond(reject(404, 'Unknown library API action'));
}
,
);
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
    : path.endsWith('.zip') ? 'application/zip' : 'application/json; charset=utf-8';
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
  if (request.method === 'GET' && action === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return respond(reject(400, 'Unsupported library file path'));
    return respond(await downloadFile(DATASET_REPO, path, token));
  }
  if (request.method === 'POST' && action === 'upload') {
    try { return respond(await upload(request, DATASET_REPO, token)); }
    catch { return respond(reject(502, 'Could not write the private dataset')); }
  }
  return respond(reject(404, 'Unknown library API action'));
}
