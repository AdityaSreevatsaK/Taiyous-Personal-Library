import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { PREVIEW_BOOKS, sampleEpub } from './preview-fixtures';

describe('isolated synthetic visual preview data', () => {
  it('uses unique 24-character hexadecimal IDs with valid appearance categories', () => {
    expect(PREVIEW_BOOKS).toHaveLength(8);
    const ids = PREVIEW_BOOKS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(id => /^[0-9a-f]{24}$/.test(id))).toBe(true);
    expect(PREVIEW_BOOKS.some(book => 'trying' in book && book.trying)).toBe(true);
    expect(PREVIEW_BOOKS.some(book => book.progress > 0)).toBe(true);
    expect(PREVIEW_BOOKS.every(book => book.author.includes('Fictional'))).toBe(true);
  });

  it('generates a real, scrollable, four-chapter EPUB with original sample text', async () => {
    const sample = PREVIEW_BOOKS[0];
    const generated = await sampleEpub(sample.title, sample.author, sample.id);
    expect(generated.type).toBe('application/epub+zip');
    const zip = await JSZip.loadAsync(await generated.arrayBuffer());
    expect(await zip.file('mimetype')?.async('string')).toBe('application/epub+zip');
    const opf = await zip.file('OEBPS/content.opf')?.async('string') || '';
    expect(opf).toContain(sample.title);
    expect(opf).toContain('<spine>');
    expect(opf.match(/<itemref /g)).toHaveLength(4);
    for (let chapter = 1; chapter <= 4; chapter++) {
      const body = await zip.file('OEBPS/chapter' + chapter + '.xhtml')?.async('string') || '';
      expect(body).toContain('Chapter ' + chapter);
      expect(body.match(/<p>/g)?.length).toBeGreaterThan(30);
    }
  });
});
