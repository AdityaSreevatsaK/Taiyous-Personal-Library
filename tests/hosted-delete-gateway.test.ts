import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as libraryApi } from '../functions/api/library';
import { onRequest as ownerApi } from '../functions/api/owner';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';
import { commit } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({
  uploadFiles: vi.fn(), commit: vi.fn(),
}));
const id = 'abcdefabcdefabcdefabcdef';
const title = 'Disposable Example Book';
const key = '01'.repeat(32);
const phrase = 'My-Independent-Owner-Passphrase-Only';
const env = { HF_OAUTH_SESSION_KEY: key, TAIYOU_OWNER_PASSPHRASE: phrase };
const fakeSession = {
  access: 'hf_' + 'a'.repeat(30),
  username: 'AdityaSreevatsaK',
  expires: Date.now() + 3600_000,
};
const catalogue = { version: 1, books: [{
  id, metadata: { id, title }, epubPath: 'data/novels/' + id + '/source.epub',
}, {
  id: '111111111111111111111111', metadata: { id: '111111111111111111111111', title: 'Keep This Book' },
  epubPath: 'data/novels/111111111111111111111111/source.epub',
}] };

async function ownerCookies() {
  const session = await sessionCookie(fakeSession, env);
  const result = await ownerApi({
    request: new Request(PUBLIC_ORIGIN + '/api/owner?action=unlock', {
      method: 'POST', headers: {
        Cookie: session, Origin: PUBLIC_ORIGIN, 'X-Taiyou-Request': 'owner-mode',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ passphrase: phrase }),
    }), env,
  });
  expect(result.status).toBe(200);
  return session + '; ' + result.headers.get('Set-Cookie')!.split(';')[0];
}
async function deletion(cookie: string, overrides: Record<string, unknown> = {},
  origin = PUBLIC_ORIGIN, marker = 'owner-delete-novel') {
  return libraryApi({
    request: new Request(PUBLIC_ORIGIN + '/api/library?action=delete-novel', {
      method: 'POST', headers: { Cookie: cookie, Origin: origin, 'X-Taiyou-Request': marker, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, ...overrides }),
    }), env,
  });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('hosted novel deletion is a protected, exact-book server action', () => {
  it('requires BOTH an owner HF session and a separate, recent owner grant', async () => {
    expect((await deletion('')).status).toBe(401);
    const cookie = await sessionCookie(fakeSession, env);
    expect((await deletion(cookie)).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
  it('blocks cross-origin requests and non-owner request markers', async () => {
    const cookies = await ownerCookies();
    expect((await deletion(cookies, {}, 'https://evil.example')).status).toBe(403);
    expect((await deletion(cookies, {}, PUBLIC_ORIGIN, 'dataset-upload')).status).toBe(403);
    expect(commit).not.toHaveBeenCalled();
  });
  it('does not delete when the ID or title differs from the current catalogue', async () => {
    const cookies = await ownerCookies();
    vi.stubGlobal('fetch', vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const uri = String(input);
      if (uri.includes('/api/datasets/')) return new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200 });
      if (uri.endsWith('/data/library.json')) return new Response(JSON.stringify(catalogue), { status: 200 });
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      throw Error('Unexpected host ' + uri);
    }));
    expect((await deletion(cookies, { title: 'Different book' })).status).toBe(409);
    expect((await deletion(cookies, { id: '0'.repeat(24) })).status).toBe(409);
    expect(commit).not.toHaveBeenCalled();
  });
  it('uses a revision-bound atomic commit for only the exact novel and private notes', async () => {
    const cookies = await ownerCookies();
    vi.stubGlobal('fetch', vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
      const uri = String(input);
      if (uri.includes('/api/datasets/')) return new Response(JSON.stringify({ sha: 'a'.repeat(40) }), { status: 200 });
      if (uri.endsWith('/data/library.json')) return new Response(JSON.stringify(catalogue), { status: 200 });
      if (uri.includes('/data/personal/reviews/') && init?.method === 'HEAD') return new Response(null, { status: 200 });
      if (init?.method === 'HEAD') return new Response(null, { status: 404 });
      throw Error('Unexpected host ' + uri);
    }));
    vi.mocked(commit).mockResolvedValue(undefined);
    const result = await deletion(cookies);
    expect(result.status).toBe(200);
    expect(commit).toHaveBeenCalledTimes(1);
    const args = vi.mocked(commit).mock.calls[0][0];
    expect(args.parentCommit).toBe('a'.repeat(40));
    expect(args.operations.map(op => op.path)).toEqual([
      'data/library.json', 'data/novels/' + id + '/', 'data/personal/reviews/' + id + '.json',
    ]);
    const catalogueWrite = args.operations[0];
    if (catalogueWrite.operation !== 'addOrUpdate' || !(catalogueWrite.content instanceof Blob)) {
      throw Error('Expected a catalogue write');
    }
    const updated = JSON.parse(await catalogueWrite.content.text());
    expect(updated.books.map((entry: {id: string}) => entry.id)).toEqual(['111111111111111111111111']);
  });
});
