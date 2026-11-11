import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from '../functions/api/library';
import { sessionCookie, PUBLIC_ORIGIN } from '../functions/_lib/oauth';
import { commit, uploadFiles } from '@huggingface/hub';

vi.mock('@huggingface/hub', () => ({
  commit: vi.fn(), uploadFiles: vi.fn(),
}));
const repo = 'AdityaSreevatsaK/Taiyous-Novels';
const sha = 'f'.repeat(40);
const id = 'a'.repeat(24), newId = 'b'.repeat(24);
const existing = {
  id, metadata: { id, title: 'Unrelated Story', author: 'Someone' },
  epubPath: 'data/novels/' + id + '/source.epub',
};
const novel = {
  id: newId, metadata: { id: newId, title: 'New Book', author: 'Someone Else' },
  epubPath: 'data/novels/' + newId + '/source.epub',
};
const catalog = { version: 1, books: [existing] };
const env = { HF_OAUTH_SESSION_KEY: 'ab'.repeat(32) };
const remoteMock = (options: { missing?: boolean; orphan?: boolean; bad?: boolean } = {}) => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://huggingface.co/api/datasets/' + repo) {
      return new Response(JSON.stringify({ sha, private: true }));
    }
    if (url.includes('/resolve/' + sha + '/data/library.json')) {
      if (options.missing) return new Response(null, { status: 404 });
      return new Response(options.bad ? '{bad' : JSON.stringify(catalog));
    }
    if (url.includes('/tree/' + sha + '/data')) {
      if (url.includes('/data/novels/')) return new Response(null, { status: 404 });
      return new Response(options.orphan ? JSON.stringify([{ path: 'data/novels/leftover/source.epub' }])
        : JSON.stringify([]));
    }
    throw Error('Unexpected remote HTTP request ' + url);
  }));
};
async function cookie() {
  return (await sessionCookie({
    access: 'hf_' + 'a'.repeat(32), username: 'AdityaSreevatsaK',
    expires: Date.now() + 3600_000,
  }, env)).split(';')[0];
}
async function req(method: 'GET' | 'POST', action: string, options: {
  payload?: object; paths?: Record<string, string>; origin?: string;
} = {}) {
  const headers: Record<string, string> = { Cookie: await cookie() };
  let body: FormData | undefined;
  if (method === 'POST') {
    headers.Origin = options.origin ?? PUBLIC_ORIGIN;
    headers['X-Taiyou-Request'] = 'dataset-upload';
    body = new FormData();
    body.append('title', 'Add a novel');
    for (const [path, contents] of Object.entries(options.paths || {})) {
      body.append('path', path);
      body.append('file', new File([contents], path.split('/').at(-1) || 'book', { type: 'application/octet-stream' }));
    }
    if (options.payload) {
      body.append('path', 'data/library.json');
      body.append('file', new File([JSON.stringify(options.payload)], 'library.json', { type: 'application/json' }));
    }
  }
  return onRequest({ request: new Request(PUBLIC_ORIGIN +
    '/api/library?action=' + action + (method === 'GET' ? '&path=data%2Flibrary.json' : ''), {
      method, headers, ...(body ? { body } : {}),
    }), env });
}
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe('Hugging Face catalogue upload integrity', () => {
  it('allows normal OAuth novel imports without separate Owner mode', async () => {
    remoteMock();
    vi.mocked(commit).mockResolvedValue(undefined);
    const response = await req('POST', 'upload', {
      paths: { [novel.epubPath]: 'EPUB_BYTES' },
      payload: { version: 1, books: [existing, novel] },
    });
    expect(response.status).toBe(200);
    expect(uploadFiles).not.toHaveBeenCalled();
    expect(commit).toHaveBeenCalledTimes(1);
    const c = vi.mocked(commit).mock.calls[0][0];
    expect(c.parentCommit).toBe(sha);
    const catalogue = c.operations.find(op => op.path === 'data/library.json');
    if (catalogue?.operation !== 'addOrUpdate' || !(catalogue.content instanceof Blob)) {
      throw Error('Expected a guarded catalogue update');
    }
    expect(JSON.parse(await catalogue.content.text()).books.map((b: {id: string}) => b.id))
      .toEqual([id, newId]);
  });
  it('refuses removing an existing book or altering its title with a normal upload', async () => {
    remoteMock();
    for (const books of [
      [novel], [{ ...existing, metadata: { ...existing.metadata, title: 'Hijacked' } }, novel],
    ]) {
      const response = await req('POST', 'upload', {
        paths: { [novel.epubPath]: 'EPUB_BYTES' }, payload: { version: 1, books },
      });
      expect(response.status).toBe(409);
    }
    expect(commit).not.toHaveBeenCalled();
  });
  it('refuses standalone file overwrites without an accompanying guarded catalogue mutation', async () => {
    remoteMock();
    const response = await req('POST', 'upload', { paths: { [existing.epubPath]: 'BAD_UPDATE' } });
    expect(response.status).toBe(403);
    expect(uploadFiles).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });
  it('reports an empty new dataset only when no private data exists', async () => {
    remoteMock({ missing: true });
    const empty = await req('GET', 'file');
    expect(empty.status).toBe(404);
    remoteMock({ missing: true, orphan: true });
    const damaged = await req('GET', 'file');
    expect(damaged.status).toBe(409);
    expect((await damaged.json()).error).toMatch(/Recovery required/);
  });
  it('fails closed for malformed catalogues and orphaned datasets', async () => {
    for (const config of [{ bad: true }, { missing: true, orphan: true }]) {
      remoteMock(config);
      const response = await req('POST', 'upload', {
        paths: { [novel.epubPath]: 'EPUB_BYTES' },
        payload: { version: 1, books: [existing, novel] },
      });
      expect([409, 502]).toContain(response.status);
    }
    expect(commit).not.toHaveBeenCalled();
  });
  it('returns a revision conflict instead of silently overwriting another commit', async () => {
    remoteMock();
    vi.mocked(commit).mockRejectedValue(new Error('409 parent commit changed'));
    const response = await req('POST', 'upload', {
      paths: { [novel.epubPath]: 'EPUB_BYTES' },
      payload: { version: 1, books: [existing, novel] },
    });
    expect(response.status).toBe(409);
    expect(commit).toHaveBeenCalledOnce();
  });
  it('preserves small personal sidecar writes without Owner mode', async () => {
    remoteMock();
    vi.mocked(uploadFiles).mockResolvedValue(undefined);
    const path = 'data/personal/reviews/' + id + '.json';
    const response = await req('POST', 'upload', { paths: { [path]: '{"ok":true}' } });
    expect(response.status).toBe(200);
    expect(uploadFiles).toHaveBeenCalledOnce();
  });
});
