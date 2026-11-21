/**
 * Ephemeral two-browser acceptance harness. Builds a temporary LOCAL
 * Cloudflare Pages runtime against one disposable real HF dataset.
 * Never repoints/changes committed production OAuth or dataset constants.
 */
import { createCipheriv, createHash, createPublicKey, randomBytes } from 'node:crypto';
import { mkdtemp, cp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { request as httpsRequest } from 'node:https';

export const origin = 'https://localhost:8797';
export const repo = process.env.HF_REAL_TEST_REPO ?? '';
const token = process.env.HF_DISPOSABLE_TEST_TOKEN ?? '';
const owner = repo.split('/')[0];
const key = randomBytes(32);
let staging, server, tlsCert, chromiumPinnedKey;

export function assert(ok, message) { if (!ok) throw Error(message); }
export function chromiumCertificatePinArgs() {
  assert(chromiumPinnedKey && /^[A-Za-z0-9+/=]{44}$/.test(chromiumPinnedKey),
    'No scoped certificate pin for disposable HTTPS gateway');
  // Chromium trusts ONLY the generated local test certificate's SPKI.
  // This is not an unrestricted certificate-verification bypass.
  return ['--ignore-certificate-errors-spki-list=' + chromiumPinnedKey];
}
assert(/^[A-Za-z0-9_.-]+\/taiyou-disposable-sync-[a-f0-9]{10}$/.test(repo) &&
  repo !== 'AdityaSreevatsaK/Taiyous-Novels' && token.startsWith('hf_'),
  'BLOCKED: requires disposable HF dataset and dedicated token');

export async function eventually(message, check, tries = 80) {
  for (let i = 0; i < tries; i++) {
    if (await check()) return;
    await new Promise(r => setTimeout(r, 300));
  }
  throw Error('Timed out: ' + message);
}
export function secureCookieValue() {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('taiyou-library:session:v1'));
  const json = JSON.stringify({
    access: token, username: owner, expires: Date.now() + 120 * 60_000,
  });
  return Buffer.concat([iv, cipher.update(json), cipher.final(), cipher.getAuthTag()])
    .toString('base64url');
}
export async function ownerContext(browser, viewport) {
  const ctx = await browser.newContext({ viewport });
  await ctx.addCookies([{
    url: origin, name: '__Host-taiyou_session',
    value: secureCookieValue(), httpOnly: true, secure: true, sameSite: 'Lax',
  }]);
  assert((await ctx.cookies(origin)).some(c => c.name === '__Host-taiyou_session'),
    'Secure, HttpOnly host-only cookie was not accepted by test browser');
  return ctx;
}
export async function getApi(page, action, init) {
  return page.evaluate(async ({action, init}) => {
    const response = await fetch('/api/library?action=' + action, {
      credentials: 'same-origin', cache: 'no-store', ...(init || {}),
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  }, { action, init });
}
export async function readBook(page, id = 'a'.repeat(24)) {
  return page.evaluate(async id => {
    const req = indexedDB.open('folio-personal-library-v1', 3);
    const db = await new Promise((ok, err) => {
      req.onsuccess = () => ok(req.result); req.onerror = () => err(req.error);
    });
    const q = db.transaction('books').objectStore('books').get(id);
    const book = await new Promise((ok, err) => {
      q.onsuccess = () => ok(q.result); q.onerror = () => err(q.error);
    });
    db.close();
    return book;
  }, id);
}
export async function startIsolatedPages() {
  const root = resolve('.');
  staging = await mkdtemp(join(tmpdir(), 'taiyou-oauth-accept-'));
  await cp(join(root, 'dist'), join(staging, 'dist'), { recursive: true });
  await cp(join(root, 'functions'), join(staging, 'functions'), { recursive: true });
  await mkdir(join(staging, 'src'), {recursive:true});
  await cp(join(root, 'src/lib'), join(staging, 'src/lib'), {recursive:true});
  await cp(join(root, 'src/types.ts'), join(staging, 'src/types.ts'));
  await symlink(join(root, 'node_modules'), join(staging, 'node_modules'), 'dir');
  const auth = join(staging, 'functions/_lib/oauth.ts');
  let source = await readFile(auth, 'utf8');
  const publicConst = "export const PUBLIC_ORIGIN = 'https://taiyous-personal-library.pages.dev';";
  const repoConst = "export const DATASET_REPO = 'AdityaSreevatsaK/Taiyous-Novels';";
  assert(source.includes(publicConst) && source.includes(repoConst),
    'Shipping OAuth constants changed: refuse test-only overlay');
  source = source.replace(publicConst, "export const PUBLIC_ORIGIN = '" + origin + "';")
    .replace(repoConst, "export const DATASET_REPO = '" + repo + "';");
  await writeFile(auth, source);
  // Only the ephemeral encryption KEY is in the local worker. Never give the
  // access token as worker env or command-line argument; browser cookies are sealed.
  await writeFile(join(staging,'.dev.vars'),
    'HF_OAUTH_SESSION_KEY="' + key.toString('hex') + '"\n', {mode:0o600});
  const certPath = join(staging, 'localhost.crt');
  const keyPath = join(staging, 'localhost.key');
  // The certificate and its key live only inside this random temporary
  // directory. The SAN is limited to the loopback hostname and address.
  execFileSync('openssl', [
    'req','-x509','-newkey','rsa:2048','-nodes','-days','1',
    '-subj','/CN=localhost','-addext',
    'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout',keyPath,'-out',certPath,
  ], { stdio: 'ignore' });
  tlsCert = await readFile(certPath);
  chromiumPinnedKey = createHash('sha256')
    .update(createPublicKey(tlsCert).export({ type: 'spki',format: 'der' }))
    .digest('base64');
  const wrangler = join(root,'node_modules/.bin/wrangler');
  server = spawn(wrangler, [
    'pages','dev','dist','--ip','127.0.0.1','--port','8797',
    '--local-protocol','https','--https-key-path',keyPath,
    '--https-cert-path',certPath,
    '--compatibility-date','2026-11-10','--compatibility-flags','nodejs_compat',
  ], {cwd:staging, env:{
    PATH:process.env.PATH, HOME:process.env.HOME, CI:'true', NODE_ENV:'test',
  }, stdio:['ignore','pipe','pipe']});
  let stderr = '';
  server.stderr.on('data', data => { stderr = (stderr+data.toString()).slice(-1500); });
  await eventually('local Cloudflare Pages runtime',async () => {
    if (server.exitCode !== null) throw Error('Pages worker failed (no credentials logged): '+stderr);
    try {
      // Explicit trust anchor for this one localhost request. Preserve
      // normal TLS verification for any external Hugging Face connection.
      const status = await new Promise((ok, fail) => {
        const probe = httpsRequest(origin+'/api/library?action=session',
          { ca: tlsCert, timeout: 1600 }, response => {
            response.resume();
            ok(response.statusCode);
          });
        probe.on('error', fail);
        probe.on('timeout', () => probe.destroy());
        probe.end();
      });
      return status === 401;
    } catch {return false;}
  },125);
}
export async function stopIsolatedPages() {
  if (server) {server.kill('SIGTERM'); await new Promise(r=>setTimeout(r,500));
    if (server.exitCode === null) server.kill('SIGKILL');}
  if (staging) await rm(staging,{recursive:true,force:true});
  key.fill(0);
}
