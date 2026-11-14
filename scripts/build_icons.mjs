// Package the owner's approved, background-free Taiyou Sun assets.
// Any missing source is an error, never silently revert to an old book icon.
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const branding = fileURLToPath(new URL('../public/branding/', import.meta.url));
for (const size of [192, 512]) {
  await copyFile(join(branding, `taiyou-app-${size}.png`), join(dist, `library-icon-${size}.png`));
}
await copyFile(join(branding, 'taiyou-mark.svg'), join(dist, 'library-icon.svg'));
const path = join(dist, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(path, 'utf8'));
manifest.icons = [
  { src: './library-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: './library-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: './library-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
];
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
console.log('Packaged approved Taiyou Sun assets (32px favicons, 192px and 512px PWA icons).');
