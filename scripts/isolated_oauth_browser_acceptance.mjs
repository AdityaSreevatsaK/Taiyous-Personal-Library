/**
 * Browser-level OAuth redirect acceptance with a local, deliberately FAKE
 * provider. Shipping Pages Functions run in Wrangler over locally pinned TLS.
 * Temporary source copies overlay only the origin, dataset, provider token API
 * and authorisation URL, with exact-string guards. No real HF account, dataset or token is accessed.
 *
 * Run after npm run build and installing playwright + wrangler@4.
 * This does NOT certify Hugging Face's actual interactive consent service.
 */
import { createHash, createPublicKey, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { request as httpsRequest, createServer as createHttpsServer } from 'node:https';
import { execFileSync, spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const origin = 'https://localhost:8798';
const mockConsentOrigin = 'https://127.0.0.1:8799';
const owner = 'OAuthFixtureOwner';
const repo = owner + '/taiyou-isolated-oauth-fixture';
const grants = new Map();
const issued = new Map();
let provider, consentServer, pages, browser, staging, tlsCert, pin;
let tokenCalls = 0;
const assert = (ok, message) => { if (!ok) throw Error(message); };
const digest = value => createHash('sha256').update(value).digest('base64url');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const asJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
};
async function startProvider() {
  provider = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://127.0.0.1').pathname;
      if (path === '/oauth/token' && req.method === 'POST') {
        tokenCalls++;
        let body = '';
        for await (const part of req) {
          body += part.toString();
          assert(body.length <= 4096, 'Oversized fake OAuth token request');
        }
        const params = new URLSearchParams(body);
        const code = params.get('code');
        const value = grants.get(code);
        grants.delete(code); // Authorisation codes are single-use, even on rejection.
        if (!value || params.get('grant_type') !== 'authorization_code' ||
            params.get('client_id') !== origin + '/oauth-client.json' ||
            params.get('redirect_uri') !== origin + '/api/oauth/callback' ||
            digest(params.get('code_verifier') || '') !== value.challenge) {
          return asJson(res, 400, { error: 'invalid_grant' });
        }
        const token = 'hf_oauth_fixture_' + randomBytes(16).toString('hex');
        issued.set(token, {
          username: value.mode === 'wrong-owner' ? 'UnrelatedUser' : owner,
          allowed: value.mode !== 'dataset-denied',
        });
        return asJson(res, 200, {
          access_token: token,
          token_type: 'bearer',
          expires_in: 3600,
          scope: value.mode === 'limited-scope' ? 'profile read-repos' :
            'profile read-repos write-repos',
        });
      }
      if (path === '/api/whoami-v2' && req.method === 'GET') {
        const user = issued.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        return user ? asJson(res, 200, { name: user.username }) :
          asJson(res, 401, { error: 'unauthorised' });
      }
      if (path === '/api/datasets/' + repo && req.method === 'GET') {
        const user = issued.get((req.headers.authorization || '').replace(/^Bearer /, ''));
        return user ? asJson(res, 200, { private: user.allowed }) :
          asJson(res, 401, { error: 'unauthorised' });
      }
      return asJson(res, 404, { error: 'unknown_mock_endpoint' });
    } catch {
      return asJson(res, 400, { error: 'invalid_mock_request' });
    }
  });
  await new Promise((ok, fail) => {
    provider.once('error', fail);
    provider.listen(0, '127.0.0.1', ok);
  });
  return 'http://127.0.0.1:' + provider.address().port;
}
function changeExactly(source, before, after) {
  assert(source.split(before).length === 2, 'Shipping OAuth constant changed; refuse temporary overlay');
  return source.replace(before, after);
}
async function stageWorker(providerBase) {
  const root = resolve('.');
  staging = await mkdtemp(join(tmpdir(), 'taiyou-mock-oauth-browser-'));
  await cp(join(root, 'dist'), join(staging, 'dist'), { recursive: true });
  // Keep the callback landing page inert: no app bootstrap or unrelated HF reads.
  await writeFile(join(staging, 'dist/index.html'),
    '<!doctype html><html><head><title>Isolated OAuth return</title></head>' +
    '<body>Local OAuth acceptance landing only</body></html>');
  await cp(join(root, 'functions'), join(staging, 'functions'), { recursive: true });
  await mkdir(join(staging, 'src'), { recursive: true });
  await cp(join(root, 'src/lib'), join(staging, 'src/lib'), { recursive: true });
  await cp(join(root, 'src/types.ts'), join(staging, 'src/types.ts'));
  await symlink(join(root, 'node_modules'), join(staging, 'node_modules'), 'dir');
  const file = join(staging, 'functions/_lib/oauth.ts');
  let source = await readFile(file, 'utf8');
  source = changeExactly(source,
    "export const PUBLIC_ORIGIN = 'https://taiyous-personal-library.pages.dev';",
    "export const PUBLIC_ORIGIN = '" + origin + "';");
  source = changeExactly(source,
    "export const DATASET_REPO = 'AdityaSreevatsaK/Taiyous-Novels';",
    "export const DATASET_REPO = '" + repo + "';");
  source = changeExactly(source,
    "const AUTH_BASE = 'https://huggingface.co';",
    "const AUTH_BASE = '" + providerBase + "';");
  await writeFile(file, source);
  const login = join(staging, 'functions/api/oauth/[action].ts');
  let loginSource = await readFile(login, 'utf8');
  loginSource = changeExactly(loginSource,
    "new URL('https://huggingface.co/oauth/authorize')",
    "new URL('" + mockConsentOrigin + "/oauth/authorize')");
  await writeFile(login, loginSource);
  await writeFile(join(staging, '.dev.vars'),
    'HF_OAUTH_SESSION_KEY="' + randomBytes(32).toString('hex') + '"\n',
    { mode: 0o600 });
  const crt = join(staging, 'localhost.crt');
  const key = join(staging, 'localhost.key');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    '-keyout', key, '-out', crt,
  ], { stdio: 'ignore' });
  tlsCert = await readFile(crt);
  pin = createHash('sha256').update(createPublicKey(tlsCert)
    .export({ type: 'spki', format: 'der' })).digest('base64');
  const wrangler = join(root, 'node_modules/.bin/wrangler');
  pages = spawn(wrangler, [
    'pages', 'dev', 'dist', '--ip', '127.0.0.1', '--port', '8798',
    '--local-protocol', 'https', '--https-key-path', key,
    '--https-cert-path', crt, '--compatibility-date', '2026-11-10',
    '--compatibility-flags', 'nodejs_compat',
  ], {
    cwd: staging,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  pages.stderr.on('data', b => { errors = (errors + String(b)).slice(-1300); });
  let ready = false;
  for (let n = 0; n < 125; n++) {
    assert(pages.exitCode === null, 'Isolated Pages worker crashed: ' + errors);
    try {
      const status = await new Promise((ok, fail) => {
        const r = httpsRequest(origin + '/api/library?action=session',
          { ca: tlsCert, timeout: 1500 }, response => {
            response.resume();
            ok(response.statusCode);
          });
        r.on('error', fail);
        r.on('timeout', () => r.destroy());
        r.end();
      });
      if (status === 401) { ready = true; break; }
    } catch { /* worker still booting */ }
    await sleep(250);
  }
  assert(ready, 'Temporary Pages Functions never became ready: ' + errors);
}
function consentPage(url) {
  assert(url.origin === mockConsentOrigin && url.pathname === '/oauth/authorize',
    'Unexpected external browser navigation');
  const p = url.searchParams;
  assert(p.get('response_type') === 'code' &&
    p.get('client_id') === origin + '/oauth-client.json' &&
    p.get('redirect_uri') === origin + '/api/oauth/callback' &&
    p.get('code_challenge_method') === 'S256' &&
    p.get('scope') === 'profile read-repos write-repos',
    'Malformed OAuth authorisation request');
  assert((p.get('state') || '').length > 32 &&
    (p.get('code_challenge') || '').length > 32,
    'Missing state or PKCE challenge');
  const state = p.get('state');
  // State is supplied by the browser request, never trust it in HTML.
  // An OAuth flow state generated by this app is a 43-character base64url nonce.
  assert(/^[A-Za-z0-9_-]{43}$/.test(state || ''),
    'Unsafe synthetic OAuth state');
  const buttons = [
    ['approve-owner', 'Approve owner'],
    ['wrong-owner', 'Approve unrelated account'],
    ['limited-scope', 'Approve limited scope'],
    ['dataset-denied', 'Approve inaccessible dataset'],
    ['bad-pkce', 'Approve invalid PKCE'],
  ];
  const forms = buttons.map(([mode, label]) => {
    const code = randomBytes(18).toString('hex');
    grants.set(code, {
      mode,
      challenge: mode === 'bad-pkce' ? 'invalid-challenge' : p.get('code_challenge'),
    });
    return '<form action="' + origin + '/api/oauth/callback" method="get">' +
      '<input type="hidden" name="state" value="' + state + '">' +
      '<input type="hidden" name="code" value="' + code + '">' +
      '<button type="submit">' + label + '</button></form>';
  }).join('\n');
  return '<!doctype html><html><head><title>Isolated mock consent</title></head>' +
    '<body><h1>Mock provider, not real Hugging Face</h1>' + forms +
    '<form action="' + origin + '/api/oauth/callback" method="get">' +
    '<input type="hidden" name="state" value="' + state + '">' +
    '<input type="hidden" name="error" value="access_denied">' +
    '<button type="submit">Deny consent</button></form></body></html>';
}
async function startConsentServer() {
  consentServer = createHttpsServer({
    cert: tlsCert,
    key: await readFile(join(staging, 'localhost.key')),
  }, (req, res) => {
    try {
      const url = new URL(req.url, mockConsentOrigin);
      if (url.pathname !== '/oauth/authorize' || req.method !== 'GET') {
        res.writeHead(404, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      const body = consentPage(url);
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(body);
    } catch {
      res.writeHead(400, { 'Cache-Control': 'no-store' });
      res.end('Invalid synthetic OAuth request');
    }
  });
  await new Promise((ok, fail) => {
    consentServer.once('error', fail);
    consentServer.listen(8799, '127.0.0.1', ok);
  });
}
async function scenario(mode, error) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const before = tokenCalls;
  await page.goto(origin + '/api/oauth/login', { waitUntil: 'domcontentloaded' });
  assert(new URL(page.url()).origin === mockConsentOrigin,
    'Browser did not follow the HTTPS mock provider redirect');
  await page.getByRole('heading', { name: 'Mock provider, not real Hugging Face' })
    .waitFor({ timeout: 5000 });
  const flow = (await context.cookies(origin)).find(x => x.name === '__Host-taiyou_oauth_flow');
  assert(flow && flow.httpOnly && flow.secure && flow.sameSite === 'Lax',
    'OAuth state/PKCE cookie is not Secure, HttpOnly, SameSite=Lax');
  if (mode === 'invalid-state') {
    await page.goto(origin + '/api/oauth/callback?code=forged&state=untrusted',
      { waitUntil: 'domcontentloaded' });
  } else {
    const label = {
      'approve-owner': 'Approve owner',
      'wrong-owner': 'Approve unrelated account',
      'limited-scope': 'Approve limited scope',
      'dataset-denied': 'Approve inaccessible dataset',
      'bad-pkce': 'Approve invalid PKCE',
      'deny': 'Deny consent',
    }[mode];
    await page.getByRole('button', { name: label, exact: true }).click();
  }
  await page.waitForURL(url => url.origin === origin);
  const result = new URL(page.url());
  assert(result.searchParams.get('oauth_error') === (error || null),
    'Unexpected OAuth result for mode ' + mode + ': ' + result.search);
  const current = await context.cookies(origin);
  assert(!current.some(x => x.name === '__Host-taiyou_oauth_flow'),
    'Completed callback left a reusable OAuth flow cookie');
  const session = current.find(x => x.name === '__Host-taiyou_session');
  if (error) {
    assert(!session, 'Failure issued an authenticated session: ' + mode);
    const status = await page.evaluate(async () =>
      (await fetch('/api/library?action=session', { cache: 'no-store' })).status);
    assert(status === 401, 'Failed OAuth callback unlocked private session');
    if (mode === 'invalid-state' || mode === 'deny') {
      assert(tokenCalls === before, 'Rejected callback exchanged a token');
    }
  } else {
    assert(session && session.secure && session.httpOnly &&
      session.sameSite === 'Lax', 'Missing secure encrypted session cookie');
    const visible = await page.evaluate(() => document.cookie);
    assert(!visible.includes('__Host-taiyou_session') && !visible.includes('hf_'),
      'Secret leaked into browser-readable cookie data');
    const read = async () => page.evaluate(async () => {
      const res = await fetch('/api/library?action=session', { cache: 'no-store' });
      return { status: res.status, value: await res.json(), cache: res.headers.get('cache-control') };
    });
    let response = await read();
    assert(response.status === 200 && response.value.connected &&
      response.value.repo === repo && response.value.username === owner &&
      response.cache.includes('no-store'), 'Authenticated Pages session not usable');
    await page.reload();
    response = await read();
    assert(response.status === 200, 'Encrypted session did not survive reload');
    const forged = await page.evaluate(async () =>
      (await fetch('/api/oauth/logout', {
        method: 'POST', headers: { 'X-Taiyou-Request': 'wrong' },
      })).status);
    assert(forged === 403 && (await read()).status === 200,
      'Forged logout invalidated a valid session');
    await page.evaluate(async () => {
      await fetch('/api/oauth/logout', {
        method: 'POST', headers: { 'X-Taiyou-Request': 'logout' },
      });
    });
    assert((await read()).status === 401, 'Sign-out did not revoke the session');
    assert(!(await context.cookies(origin)).some(c => c.name === '__Host-taiyou_session'),
      'Signed-out encrypted cookie was not deleted');
  }
  await context.close();
  console.log('PASS: isolated OAuth browser case ' + mode);
}
try {
  const providerBase = await startProvider();
  await stageWorker(providerBase);
  await startConsentServer();
  browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors-spki-list=' + pin],
  });
  for (const [mode, expected] of [
    ['invalid-state', 'invalid_callback'],
    ['deny', 'invalid_callback'],
    ['bad-pkce', 'exchange_failed'],
    ['limited-scope', 'insufficient_scope'],
    ['wrong-owner', 'wrong_account'],
    ['dataset-denied', 'dataset_access'],
    ['approve-owner', null],
  ]) await scenario(mode, expected);
  console.log('PASS: isolated real Pages Functions, browser redirects, PKCE, callbacks, encrypted sessions and logout');
  console.log('LIMITATION: provider consent and token API were simulated locally; real HF account consent is NOT verified');
} finally {
  if (browser) await browser.close();
  if (pages) {
    pages.kill('SIGTERM');
    await sleep(450);
    if (pages.exitCode === null) pages.kill('SIGKILL');
  }
  if (consentServer) await new Promise(ok => consentServer.close(ok));
  if (provider) await new Promise(ok => provider.close(ok));
  if (staging) await rm(staging, { recursive: true, force: true });
}
