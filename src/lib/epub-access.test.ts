import { describe, expect, it, vi } from 'vitest';
import { readEpubWithoutCaching } from './epub-access';

const cached = new Blob(['cached epub']);
const remote = new Blob(['hosted epub']);

describe('EPUB access does not silently persist an offline download', () => {
  it('uses an existing offline/imported copy without downloading or writing', async () => {
    const localRead = vi.fn(async () => cached);
    const hostedRead = vi.fn(async () => remote);
    const book = { id: 'a'.repeat(24), cloud: true };
    expect(await readEpubWithoutCaching(book, localRead, hostedRead)).toBe(cached);
    expect(localRead).toHaveBeenCalledOnce();
    expect(hostedRead).not.toHaveBeenCalled();
  });

  it('fetches hosted EPUB bytes for reading but never adds a browser-side offline copy', async () => {
    const localRead = vi.fn(async () => { throw new Error('not cached'); });
    const hostedRead = vi.fn(async () => remote);
    const book = { id: 'b'.repeat(24), cloud: true };
    expect(await readEpubWithoutCaching(book, localRead, hostedRead)).toBe(remote);
    expect(localRead).toHaveBeenCalledWith(book.id);
    expect(hostedRead).toHaveBeenCalledOnce();
  });

  it('refuses to invent a hosted EPUB for an unbacked local-only import', async () => {
    const missing = new Error('Local EPUB is missing');
    const localRead = vi.fn(async (): Promise<Blob> => { throw missing; });
    const hostedRead = vi.fn(async () => remote);
    await expect(readEpubWithoutCaching({ id: 'c'.repeat(24), cloud: false }, localRead, hostedRead))
      .rejects.toBe(missing);
    expect(hostedRead).not.toHaveBeenCalled();
  });

  it('does not hide a failed remote read as a successful offline save', async () => {
    const localRead = vi.fn(async (): Promise<Blob> => { throw new Error('not cached'); });
    const hostedRead = vi.fn(async (): Promise<Blob> => { throw new Error('HTTP 503'); });
    await expect(readEpubWithoutCaching({ id: 'd'.repeat(24), cloud: true }, localRead, hostedRead))
      .rejects.toThrow('HTTP 503');
  });
});
