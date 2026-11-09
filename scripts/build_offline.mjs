// Generate a same-origin-only offline service worker from the exact production build.
// Never precache private Hugging Face dataset requests or credentials.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dist = new URL('../dist/', import.meta.url);
const root = fileURLToPath(dist);
const files = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    if (item.name.startsWith('.')) continue;
    const file = join(dir, item.name);
    if (item.isDirectory()) await walk(file);
    else if (item.isFile() && /\.(?:html|js|css|svg|png|jpg|jpeg|webp|woff2?|ico|json|webmanifest)$/.test(item.name)) {
      const path = relative(root, file).split(sep).join('/');
      if (path !== 'sw.js') files.push(path);
    }
  }
}
await walk(root);
if (!files.includes('index.html')) throw new Error('The compiled index.html is missing');
const hash = createHash('sha256');
for (const name of files.sort()) {
  hash.update(name);
  hash.update(await readFile(join(root, name)));
}
const version = hash.digest('hex').slice(0, 14);
const source = `/* Generated from dist by scripts/build_offline.mjs; never edit deployed copy. */
const SHELL_CACHE = 'taiyou-shell-${version}';
const APP_FILES = ${JSON.stringify(files.map(x => './' + x))};
const SHELL_PAGE = './index.html';
const shellUrls = APP_FILES.map(path => new URL(path, self.registration.scope).href);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(shellUrls);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('taiyou-shell-') && key !== SHELL_CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept a cross-origin request, including private dataset fetches.
  if (url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope)) return;
  // Navigation: network-first with exact cached app shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) return response;
        throw new Error('Navigation unavailable');
      } catch {
        const cached = await caches.match(new URL(SHELL_PAGE, self.registration.scope).href);
        return cached || Response.error();
      }
    })());
    return;
  }
  // Serve only assets already stored at install time. Other same-origin
  // requests fall through to the network, but are never cached or persisted.
  // Cross-origin private Hugging Face dataset requests are never intercepted.
  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    return fetch(request);
  })());
});
`;
await writeFile(new URL('../dist/sw.js', import.meta.url), source);
console.log(`Offline app shell ${version}: ${files.length} precached files`);
