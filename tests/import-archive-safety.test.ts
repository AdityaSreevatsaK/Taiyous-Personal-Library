import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { assertZipEntrySize, readBoundedZipBytes } from '../src/lib/importer';

async function loadedEntry(text: string) {
  const zip = new JSZip();
  zip.file('source.epub', text);
  const loaded = await JSZip.loadAsync(await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  const source = loaded.file('source.epub');
  if (!source) throw new Error('Missing generated test ZIP entry');
  return source;
}

describe('untrusted ZIP inflation bounds', () => {
  it('accepts a small, valid ZIP entry without changing its extracted bytes', async () => {
    const entry = await loadedEntry('English 中文 novel contents');
    const expected = new TextEncoder().encode('English 中文 novel contents');
    expect(await readBoundedZipBytes(entry, 100)).toEqual(expected);
  });
  it('rejects a compressed entry whose declared size exceeds the permitted limit', async () => {
    const entry = await loadedEntry('a'.repeat(2048));
    expect(() => assertZipEntrySize(entry, 128)).toThrow(/oversized/);
    await expect(readBoundedZipBytes(entry, 128)).rejects.toThrow(/oversized/);
  });
  it('rejects missing or tampered central-directory size metadata before inflation', async () => {
    const entry = await loadedEntry('One chapter');
    const altered = entry as unknown as { _data: { uncompressedSize: number } };
    altered._data.uncompressedSize = Number.POSITIVE_INFINITY;
    expect(() => assertZipEntrySize(entry, 500)).toThrow(/invalid/);
  });
  it('enforces its live byte cap even if the declared uncompressed size lies', async () => {
    const entry = await loadedEntry('a'.repeat(50000));
    const altered = entry as unknown as { _data: { uncompressedSize: number } };
    altered._data.uncompressedSize = 4;
    await expect(readBoundedZipBytes(entry, 64)).rejects.toThrow(/decompression limit|uncompressed length/);
  });
});
