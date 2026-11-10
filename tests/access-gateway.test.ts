import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAllowedDatasetPath, onRequest as library } from '../functions/api/library';
import { onRequest as oauth } from '../functions/api/oauth/[action]';
import {
  DATASET_REPO, CLIENT_ID, REDIRECT_URI, SESSION_COOKIE, FLOW_COOKIE,
  sessionCookie, type OAuthSession,
} from '../functions/_lib/oauth';

const origin = 'https://taiyous-personal-library.pages.dev';
const env = { HF_OAUTH_SESSION_KEY: 'a'.repeat(64) };
const guest = 'different-hf-user';
const owner = DATASET_REPO.split('/')[0];

afterEach(() => vi.unstubAllGlobals());
function cookies(response: Response): string[] {
  return response.headers.getSetCookie().map(x => x.split(';')[0]);
}
function cookieFrom(response: Response, name: string): string {
  return cookies(response).find(x => x.startsWith(name + '=')) || '';
}
function fakeHf(token: string, username = owner) {
  const calls: string[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL, opts?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    calls.push(url);
    if (url.endsWith('/oauth/token')) {
      expect(opts?.method).toBe('POST');
      const parameters = new URLSearchParams(opts?.body as string);
      expect(parameters.get('client_id')).toBe(CLIENT_ID);
      expect(parameters.get('code_verifier')).toBeTruthy();
      return new Response(JSON.stringify({
        access_token: token, expires_in: 3600, scope: 'profile read-repos write-repos',
      }), { headers: { 'Content-Type': 'application/json' } });
    }
    if (url.endsWith('/api/whoami-v2')) {
      return new Response(JSON.stringify({ name: username }));
    }
    if (url.endsWith('/api/datasets/' + DATASET_REPO)) {
      return new Response(JSON.stringify({ private: true }));
    }
    if (url.includes('/resolve/main/data/novels/') && url.endsWith('/cover.jpg')) {
      return new Response(new Uint8Array([255, 216, 255, 224, 0, 1, 2]), { headers: { 'Content-Type': 'image/jpeg' } });
    }
    if (url.includes('/resolve/main/data/library.json')) {
      return new Response(JSON.stringify({ version: 1, books: [] }));
    }
    throw new Error('Unexpected fetch: ' + url);
  });
  vi.stubGlobal('fetch', mock);
  return { mock, calls };
}
describe('HF OAuth private dataset gateway', () => {
  it('uses a public JSON metadata client ID on a normal Cloudflare Pages asset path', () => {
    expect(CLIENT_ID).toBe(origin + '/oauth-client.json');
    expect(CLIENT_ID).not.toContain('/.well-known/');
  });
  it('only permits exact catalogue, EPUB, ZIP and personal data paths', () => {
    const id = 'a'.repeat(24);
    for (const item of [
      'data/library.json', 'data/personal/collections.json',
      'data/personal/reviews/' + id + '.json',
      'data/personal/progress/' + id + '.json',
      'data/novels/' + id + '/source.epub',
      'data/novels/' + id + '/original.zip',
      'data/novels/' + id + '/cover.jpg',
    ]) expect(isAllowedDatasetPath(item)).toBe(true);
    for (const item of [
      '../.env', 'data/../secrets.json', 'data/private.txt',
      'data/personal/progress/../../library.json',
      'data/novels/' + id + '/other.zip',
    ]) expect(isAllowedDatasetPath(item)).toBe(false);
  });
  it('never serves the library API on a preview hostname', async () => {
    const result = await library({
      request: new Request('https://dev.taiyous-personal-library.pages.dev/api/library?action=session'),
      env,
    });
    expect(result.status).toBe(403);
  });
  it('fails closed without session encryption configuration', async () => {
    const result = await library({ request: new Request(origin + '/api/library?action=session'), env: {} });
    expect(result.status).toBe(503);
  });
  it('rejects missing, forged and expired sessions', async () => {
    const url = origin + '/api/library?action=session';
    expect((await library({ request: new Request(url), env })).status).toBe(401);
    expect((await library({
      request: new Request(url, { headers: { Cookie: SESSION_COOKIE + '=garbage' } }), env,
    })).status).toBe(401);
    const expired: OAuthSession = { access: 'hf_oauth_testtoken', username: owner, expires: Date.now() - 60_000 };
    const cookie = await sessionCookie(expired, env);
    expect((await library({
      request: new Request(url, { headers: { Cookie: cookie.split(';')[0] } }), env,
    })).status).toBe(401);
  });
  it('initiates an external public OAuth PKCE login with an encrypted state cookie', async () => {
    const response = await oauth({ request: new Request(origin + '/api/oauth/login'), env });
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get('Location')!);
    expect(location.origin).toBe('https://huggingface.co');
    expect(location.pathname).toBe('/oauth/authorize');
    expect(location.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(location.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(location.searchParams.get('code_challenge_method')).toBe('S256');
    expect(location.searchParams.get('code_challenge')!.length).toBeGreaterThan(30);
    const state = location.searchParams.get('state');
    expect(state!.length).toBeGreaterThan(30);
    const flowCookie = cookieFrom(response, FLOW_COOKIE);
    expect(flowCookie).toContain('=');
    expect(flowCookie).not.toContain(state!);
    expect(response.headers.get('Set-Cookie')).toContain('HttpOnly');
  });
  it('rejects callbacks with mismatched state and never exchanges the code', async () => {
    const login = await oauth({ request: new Request(origin + '/api/oauth/login'), env });
    const cookie = cookieFrom(login, FLOW_COOKIE);
    const { mock } = fakeHf('hf_oauth_sample123');
    const res = await oauth({ request: new Request(origin + '/api/oauth/callback?code=abc&state=wrong', {
      headers: { Cookie: cookie },
    }), env });
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toContain('invalid_callback');
    expect(mock).not.toHaveBeenCalled();
  });
  it('only issues a session for the verified dataset owner', async () => {
    const login = await oauth({ request: new Request(origin + '/api/oauth/login'), env });
    const state = new URL(login.headers.get('Location')!).searchParams.get('state');
    const flow = cookieFrom(login, FLOW_COOKIE);
    fakeHf('hf_oauth_randomtoken123', guest);
    const res = await oauth({
      request: new Request(origin + '/api/oauth/callback?code=abc&state=' + state,
        { headers: { Cookie: flow } }), env,
    });
    expect(res.headers.get('Location')).toContain('wrong_account');
    expect(cookieFrom(res, SESSION_COOKIE)).toBe('');
  });
  it('persists a private HF OAuth session across app reloads without exposing a bearer token', async () => {
    const login = await oauth({ request: new Request(origin + '/api/oauth/login'), env });
    const state = new URL(login.headers.get('Location')!).searchParams.get('state');
    const flow = cookieFrom(login, FLOW_COOKIE);
    const { calls } = fakeHf('hf_oauth_valid012345');
    const signedIn = await oauth({
      request: new Request(origin + '/api/oauth/callback?code=abc&state=' + state,
        { headers: { Cookie: flow } }), env,
    });
    expect(signedIn.status).toBe(303);
    expect(signedIn.headers.get('Location')).toBe(origin + '/');
    const cookie = cookieFrom(signedIn, SESSION_COOKIE);
    expect(cookie).toContain('=');
    expect(cookie).not.toContain('hf_oauth_valid012345');
    expect(signedIn.headers.get('Set-Cookie')).toContain('HttpOnly');
    const reloaded = await library({ request: new Request(origin + '/api/library?action=session', {
      headers: { Cookie: cookie },
    }), env });
    expect(reloaded.status).toBe(200);
    expect(await reloaded.json()).toEqual({ connected: true, repo: DATASET_REPO, username: owner });
    const book = await library({ request: new Request(
      origin + '/api/library?action=file&path=' + encodeURIComponent('data/library.json'),
      { headers: { Cookie: cookie } },
    ), env });
    expect(book.status).toBe(200);
    expect(await book.json()).toEqual({ version: 1, books: [] });
    const artwork = await library({ request: new Request(origin + '/api/library?action=file&path=' +
      encodeURIComponent('data/novels/' + 'a'.repeat(24) + '/cover.jpg'),
      { headers: { Cookie: cookie } }), env });
    expect(artwork.status).toBe(200);
    expect(artwork.headers.get('Content-Type')).toBe('image/jpeg');
    expect(Array.from(new Uint8Array(await artwork.arrayBuffer())).slice(0, 3)).toEqual([255, 216, 255]);
    expect(calls.some(item => item.includes('hf_oauth_valid012345'))).toBe(false);
  });
  it('requires same-origin and an explicit header for writes and logout', async () => {
    const session: OAuthSession = { access: 'hf_oauth_validtoken123', username: owner, expires: Date.now() + 3600_000 };
    const cookie = (await sessionCookie(session, env)).split(';')[0];
    const url = origin + '/api/library?action=upload';
    const req = new Request(url, { method: 'POST', headers: {
      Cookie: cookie, Origin: 'https://evil.example', 'X-Taiyou-Request': 'dataset-upload',
    }, body: new FormData() });
    const upload = await library({ request: req, env });
    expect(upload.status).toBe(403);
    expect((await oauth({
      request: new Request(origin + '/api/oauth/logout', { method: 'POST', headers: { Cookie: cookie } }), env,
    })).status).toBe(403);
    expect((await oauth({
      request: new Request(origin + '/api/oauth/logout', { method: 'POST', headers: {
        Cookie: cookie, Origin: origin, 'X-Taiyou-Request': 'logout',
      } }), env,
    })).status).toBe(303);
  });
});
