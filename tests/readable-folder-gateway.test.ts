import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest as libraryApi } from '../functions/api/library';
import { onRequest as ownerApi } from '../functions/api/owner';
import { PUBLIC_ORIGIN, sessionCookie } from '../functions/_lib/oauth';
import { commit } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({ commit: vi.fn(), uploadFiles: vi.fn() }));
const repo = 'AdityaSreevatsaK/Taiyous-Novels';
const id = 'abcdefabcdefabcdefabcdef', other = '123456789012345678901234';
const folder = 'data/novels/' + id + ' - 修仙之路 The Returning Knight';
const title = 'Current title differs from original readable folder';
const sha = 'a'.repeat(40);
const secret = '01'.repeat(32), passphrase = 'Different-Owner-Grant-For-Gateway-Test';
const env = { HF_OAUTH_SESSION_KEY: secret, TAIYOU_OWNER_PASSPHRASE: passphrase };
const entry = {
  id, metadata: { id, title, coverPath: folder + '/cover.png' },
  epubPath: folder + '/source.epub',
  archivePath: folder + '/original.zip',
  coverPath: folder + '/cover.webp',
};
const otherEntry = {
  id: other, metadata: { id: other, title: 'Keep me' },
  epubPath: 'data/novels/' + other + '/source.epub',
};
const catalogue = { version: 1, books: [entry, otherEntry] };
async function session() {
  return (await sessionCookie({
    access: 'hf_' + 'a'.repeat(30), username: 'AdityaSreevatsaK',
    expires: Date.now() + 3600_000,
  }, env)).split(';')[0];
}
async function query(action: 'file'|'exists', path: string) {
  return libraryApi({
    request: new Request(PUBLIC_ORIGIN + '/api/library?action=' + action +
      '&path=' + encodeURIComponent(path), { headers: { Cookie: await session() } }),
    env,
  });
}
async function ownerCookie() {
  const cookie = await session();
  const response = await ownerApi({
    request: new Request(PUBLIC_ORIGIN + '/api/owner?action=unlock', {
      method: 'POST',
      headers: {
        Cookie: cookie, Origin: PUBLIC_ORIGIN, 'X-Taiyou-Request': 'owner-mode',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ passphrase }),
    }), env,
  });
  expect(response.status).toBe(200);
  return cookie + '; ' + response.headers.get('Set-Cookie')!.split(';')[0];
}
async function remove(cookie: string) {
  return libraryApi({request: new Request(PUBLIC_ORIGIN + '/api/library?action=delete-novel', {
    method: 'POST', headers: {
      Cookie: cookie, Origin: PUBLIC_ORIGIN,
      'X-Taiyou-Request': 'owner-delete-novel', 'Content-Type': 'application/json',
    }, body: JSON.stringify({id, title}),
  }), env});
}
afterEach(() => {vi.unstubAllGlobals();vi.clearAllMocks();});

describe('authenticated readable-folder gateway compatibility', () => {
  it('streams EPUB, archive, PNG and WebP by encoded catalogue paths', async () => {
    const captured: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
      const value = String(url);
      captured.push(value);
      return new Response(new Uint8Array([1,2,3,4]), {status: 200});
    }));
    for (const [file, mime] of [
      ['source.epub', 'application/epub+zip'],
      ['original.zip', 'application/zip'],
      ['cover.png', 'image/png'],
      ['cover.webp', 'image/webp'],
    ]) {
      const result = await query('file', folder + '/' + file);
      expect(result.status).toBe(200);
      expect(result.headers.get('content-type')).toBe(mime);
    }
    expect(captured).toHaveLength(4);
    for (const url of captured) {
      expect(url).toContain(id + '%20-%20');
      expect(url).toContain(encodeURIComponent('修仙之路'));
      expect(url).not.toContain('/' + id + '/source.epub');
    }
  });

  it('checks existence of a readable EPUB over HEAD without trusting arbitrary paths', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe('HEAD');
      return new Response(null, {status: 200});
    });
    vi.stubGlobal('fetch', fetcher);
    expect((await query('exists', entry.epubPath)).status).toBe(200);
    const good = await query('exists', entry.epubPath);
    expect((await good.json()).exists).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const path of [
      folder + '/../source.epub', folder + '/other.epub',
      folder + '/cover.png', folder + '/source.epub/escape',
    ]) expect((await query('exists', path)).status).toBe(400);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('deletes precisely the catalogue-declared readable folder and no other', async () => {
    const cookie = await ownerCookie();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const name = String(url);
      if (name.endsWith('/api/datasets/' + repo)) return new Response(JSON.stringify({sha, private: true}));
      if (name.endsWith('/data/library.json')) return new Response(JSON.stringify(catalogue));
      if (init?.method === 'HEAD') return new Response(null,{status:404});
      throw new Error('Unexpected HF URL ' + name);
    }));
    vi.mocked(commit).mockResolvedValue(undefined);
    const result = await remove(cookie);
    expect(result.status).toBe(200);
    expect(commit).toHaveBeenCalledOnce();
    const args = vi.mocked(commit).mock.calls[0][0];
    expect(args.parentCommit).toBe(sha);
    expect(args.operations.map(op => op.path)).toEqual(['data/library.json', folder + '/']);
    expect(args.operations.map(op => op.path)).not.toContain('data/novels/' + id + '/');
    const updated = args.operations[0];
    if (updated.operation !== 'addOrUpdate' || !(updated.content instanceof Blob)) throw Error('Missing catalogue update');
    expect((JSON.parse(await updated.content.text()).books as Array<{id:string}>).map(x => x.id)).toEqual([other]);
  });

  it('fails closed when archived/cover paths escape the folder or owner mode is missing', async () => {
    const ordinaryCookie = await session();
    expect((await remove(ordinaryCookie)).status).toBe(403);
    const cookie = await ownerCookie();
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const name = String(url);
      if (name.endsWith('/api/datasets/' + repo)) return new Response(JSON.stringify({sha,private:true}));
      if (name.endsWith('/data/library.json')) return new Response(JSON.stringify({
        version: 1, books: [{ ...entry, metadata: {...entry.metadata, coverPath:'data/novels/'+other+'/cover.png'}}],
      }));
      if (init?.method === 'HEAD') return new Response(null,{status:404});
      throw new Error('Unexpected HF URL '+name);
    }));
    const response = await remove(cookie);
    expect(response.status).toBe(502);
    expect(commit).not.toHaveBeenCalled();
  });
});
