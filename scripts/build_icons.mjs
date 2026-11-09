// Generate standalone install icons without pulling in extra image dependencies.
// Source art is deliberately original: a simple green book and page bookmark.
import { readFile, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const pngHeader = Buffer.from('89504e470d0a1a0a', 'hex');
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const label = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([label, data])));
  return Buffer.concat([length, label, data, crc]);
}
function generate(size) {
  const scale = size / 192;
  const bytes = Buffer.alloc(size * (1 + size * 4));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 4);
    bytes[row] = 0;
    for (let x = 0; x < size; x++) {
      const px = (x + .5) / scale, py = (y + .5) / scale;
      const inside = (a,b,c,d) => px >= a && px < c && py >= b && py < d;
      const isPage = inside(35, 31, 157, 161);
      const isBookmark = inside(106, 31, 130, 70);
      const isLine = [65, 87, 109].some(line => inside(56, line, line === 109 ? 111 : 136, line + 8));
      const rgb = isBookmark ? [119, 154, 126] : isLine ? [45, 91, 65] : isPage ? [233, 232, 213] : [33, 56, 46];
      const p = row + 1 + x * 4;
      bytes[p] = rgb[0]; bytes[p+1] = rgb[1]; bytes[p+2] = rgb[2]; bytes[p+3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([pngHeader, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(bytes, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
for (const size of [192, 512]) await writeFile(join(dist, `library-icon-${size}.png`), generate(size));
const path = join(dist, 'manifest.webmanifest');
const manifest = JSON.parse(await readFile(path, 'utf8'));
manifest.icons = [
  { src: './library-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
  { src: './library-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
  { src: './library-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
];
await writeFile(path, JSON.stringify(manifest, null, 2) + '\n');
console.log('Generated 192px and 512px install icons.');
