import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/owner';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';

const key = '01'.repeat(32);
const phrase = 'Read-Novels-Only-Owner-Signin-2026';
const fakeSession = {
  access: 'hf_' + 'b'.repeat(25),
  username: 'AdityaSreevatsaK',
  expires: Date.now() + 3600_000,
};

async function request(action: string, options: {
  cookie?: string; origin?: string; phrase?: string; env?: Record<string, string>;
  method?: 'POST' | 'GET'; marker?: string;
} = {}): Promise<Response> {
  const method = options.method ?? 'POST';
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  if (method === 'POST') {
    headers.Origin = options.origin ?? PUBLIC_ORIGIN;
    headers['X-Taiyou-Request'] = options.marker ?? 'owner-mode';
    headers['Content-Type'] = 'application/json';
  }
  return onRequest({
    request: new Request(PUBLIC_ORIGIN + '/api/owner?action=' + action, {
      method, headers, ...(method === 'POST' ? { body: JSON.stringify({ passphrase: options.phrase }) } : {}),
    }),
    env: { HF_OAUTH_SESSION_KEY: key, TAIYOU_OWNER_PASSPHRASE: phrase, ...options.env },
  });
}

describe('independent owner access for destructive library actions', () => {
  it('rejects unlock and status without the HF owner session', async () => {
    expect((await request('unlock', { phrase })).status).toBe(401);
    expect((await request('status', { method: 'GET' })).status).toBe(401);
  });
  it('fails closed if the separate owner secret is missing or too short', async () => {
    const cookie = await sessionCookie(fakeSession, { HF_OAUTH_SESSION_KEY: key });
    const status = await request('status', { cookie, method: 'GET', env: { TAIYOU_OWNER_PASSPHRASE: 'weak' } });
    expect((await status.json()).configured).toBe(false);
    expect((await request('unlock', { cookie, phrase, env: { TAIYOU_OWNER_PASSPHRASE: 'weak' } })).status).toBe(503);
  });
  it('blocks forged origins and missing request markers', async () => {
    const cookie = await sessionCookie(fakeSession, { HF_OAUTH_SESSION_KEY: key });
    expect((await request('unlock', { cookie, phrase, origin: 'https://evil.example' })).status).toBe(403);
    expect((await request('unlock', { cookie, phrase, marker: '' })).status).toBe(403);
  });
  it('verifies the separate owner passphrase and grants only a brief HttpOnly cookie', async () => {
    const session = await sessionCookie(fakeSession, { HF_OAUTH_SESSION_KEY: key });
    expect((await request('verify', { cookie: session })).status).toBe(403);
    expect((await request('unlock', { cookie: session, phrase: 'incorrect passphrase' })).status).toBe(403);
    const unlocked = await request('unlock', { cookie: session, phrase });
    expect(unlocked.status).toBe(200);
    const value = unlocked.headers.get('Set-Cookie') || '';
    expect(value).toContain('__Host-taiyou_owner=');
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Strict');
    expect(value).toContain('Max-Age=600');
    expect(value).not.toContain(phrase);
    const ownCookie = value.split(';')[0];
    expect((await request('verify', { cookie: session + '; ' + ownCookie })).status).toBe(200);
    const wrongAccountSession = await sessionCookie({ ...fakeSession, access: 'hf_' + 'c'.repeat(25) }, { HF_OAUTH_SESSION_KEY: key });
    expect((await request('verify', { cookie: wrongAccountSession + '; ' + ownCookie })).status).toBe(403);
    const locked = await request('lock', { cookie: session + '; ' + ownCookie });
    expect(locked.headers.get('Set-Cookie')).toContain('Max-Age=0');
  });
});
