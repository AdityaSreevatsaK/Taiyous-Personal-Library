import { createRemoteJWKSet, jwtVerify } from 'jose';
import { uploadFiles } from '@huggingface/hub';

/**
 * Private Hugging Face Dataset gateway. Every request requires a verified
 * Cloudflare Access application JWT AND the explicitly allowed owner email.
 * Hugging Face credentials stay exclusively in the Pages Function environment.
 */
interface Bindings {
  HF_DATASET_TOKEN?: string;
  HF_DATASET_REPO?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ALLOWED_EMAIL?: string;
}
interface PagesContext { request: Request; env: Bindings }
const NO_STORE = { 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' };
const BOOK_ID = '[0-9a-f]{24}';
const FILE_PATH = new RegExp(
  '^(?:data/library\\.json|data/personal/collections\\.json|' +
  'data/personal/(?:reviews|progress)/' + BOOK_ID + '\\.json|' +
  'data/novels/' + BOOK_ID + '/(?:source\\.epub|original\\.zip))$',
);
const DATASET_ID = /^[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}$/;
const MAX_UPLOAD_BYTES = 75 * 1024 * 1024;
const MAX_SINGLE_BYTES = 70 * 1024 * 1024;
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

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
function accessTokenFrom(request: Request): string {
  const assertion = request.headers.get('Cf-Access-Jwt-Assertion');
  if (assertion) return assertion;
  // The Access application JWT is also issued as an HTTP-only same-origin
  // cookie. Always verify its signature and claims, never trust its presence.
  return request.headers.get('Cookie')?.match(/(?:^|;\s*)CF_Authorization=([^;]+)/)?.[1] || '';
}
async function ownerVerified(request: Request, env: Bindings): Promise<boolean> {
  const domain = env.CF_ACCESS_TEAM_DOMAIN!.replace(/\/$/, '');
  const jwt = accessTokenFrom(request);
  if (!jwt) return false;
  let verifier = jwksCache.get(domain);
  if (!verifier) {
    verifier = createRemoteJWKSet(new URL(domain + '/cdn-cgi/access/certs'));
    jwksCache.set(domain, verifier);
  }
  try {
    const { payload } = await jwtVerify(jwt, verifier, {
      audience: env.CF_ACCESS_AUD!, issuer: domain, algorithms: ['RS256'],
    });
    // Never accept Cloudflare service tokens or organisation-wide Access JWTs:
    // the token must be for this application and the intended human owner.
    return payload.type === 'app' &&
      typeof payload.email === 'string' &&
      payload.email.toLowerCase() === env.CF_ACCESS_ALLOWED_EMAIL!.toLowerCase();
  } catch {
    return false;
  }
}

async function privateDatasetInfo(repo: string, token: string): Promise<boolean> {
  const response = await fetch('https://huggingface.co/api/datasets/' + repo, {
    headers: { Authorization: 'Bearer ' + token }, cache: 'no-store',
  });
  if (!response.ok) return false;
  const data = await response.json() as { private?: boolean };
  return data.private === true;
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

async function upload(request: Request, env: Bindings, repo: string): Promise<Response> {
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
    accessToken: env.HF_DATASET_TOKEN!,
    files,
    commitTitle: title,
  });
  return json({ saved: true });
}

export async function onRequest({ request, env }: PagesContext): Promise<Response> {
  const url = new URL(request.url);
  // This API is never exposed on an unprotected Pages preview hostname.
  if (url.hostname !== 'taiyous-personal-library.pages.dev') {
    return reject(403, 'Private API is restricted to the production hostname');
  }
  const domain = (env.CF_ACCESS_TEAM_DOMAIN || '').replace(/\/$/, '');
  const repo = env.HF_DATASET_REPO || '';
  const allowedEmail = env.CF_ACCESS_ALLOWED_EMAIL || '';
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(domain) ||
      !/^[a-f0-9]{64}$/i.test(env.CF_ACCESS_AUD || '') ||
      !allowedEmail.includes('@') || allowedEmail.length > 254 ||
      !DATASET_ID.test(repo) || repo.includes('..') ||
      !/^hf_[A-Za-z0-9]{12,}$/.test(env.HF_DATASET_TOKEN || '')) {
    return reject(503, 'Private cloud connection is not yet configured');
  }
  if (!(await ownerVerified(request, env))) return reject(403, 'Cloudflare Access sign-in required');
  if (request.method === 'GET' && url.searchParams.get('action') === 'session') {
    if (!(await privateDatasetInfo(repo, env.HF_DATASET_TOKEN!))) {
      return reject(503, 'Configured Hugging Face dataset is inaccessible or not private');
    }
    return json({ connected: true, repo });
  }
  if (request.method === 'GET' && url.searchParams.get('action') === 'info') {
    if (!(await privateDatasetInfo(repo, env.HF_DATASET_TOKEN!))) {
      return reject(502, 'Private dataset is inaccessible');
    }
    return json({ private: true });
  }
  if (request.method === 'GET' && url.searchParams.get('action') === 'file') {
    const path = url.searchParams.get('path');
    if (!isAllowedDatasetPath(path)) return reject(400, 'Unsupported library file path');
    return downloadFile(repo, path, env.HF_DATASET_TOKEN!);
  }
  if (request.method === 'POST' && url.searchParams.get('action') === 'upload') {
    try { return await upload(request, env, repo); }
    catch { return reject(502, 'Could not write the private dataset'); }
  }
  return reject(404, 'Unknown library API action');
}
