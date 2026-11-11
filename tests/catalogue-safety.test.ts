import { describe, expect, it } from 'vitest';
import {
  parseDatasetCatalogue, planAdditiveCatalogueUpload, type DatasetCatalogue,
} from '../functions/_lib/catalogue';

const id = 'a'.repeat(24), secondId = 'b'.repeat(24);
const base = {
  id, metadata: { id, title: 'Keep Me', author: 'A' },
  epubPath: 'data/novels/' + id + '/source.epub',
};
const next = {
  id: secondId, metadata: { id: secondId, title: 'New Story', author: 'B' },
  epubPath: 'data/novels/' + secondId + '/source.epub',
};
const original: DatasetCatalogue = { version: 1, books: [base] };
const nextCatalog: DatasetCatalogue = { version: 1, books: [base, next] };

describe('strict additive cloud catalogue contract', () => {
  it('permits exactly one new novel and preserves existing entries', () => {
    const plan = planAdditiveCatalogueUpload(original, nextCatalog, [
      next.epubPath, 'data/library.json',
    ]);
    expect(plan.operation).toBe('add');
    expect(plan.next.books).toEqual([base, next]);
  });
  it('rejects removal, replacement, and stale catalogue uploads', () => {
    const cases: DatasetCatalogue[] = [
      { version: 1, books: [] },
      { version: 1, books: [{ ...base, metadata: { ...base.metadata, title: 'Changed' } }] },
      { version: 1, books: [next] },
      { version: 1, books: [base] },
    ];
    for (const replacement of cases) {
      expect(() => planAdditiveCatalogueUpload(original, replacement,
        [next.epubPath, 'data/library.json'])).toThrow();
    }
  });
  it('rejects mismatched, duplicated, or undeclared novel files', () => {
    for (const paths of [
      ['data/library.json', 'data/novels/' + id + '/source.epub'],
      ['data/library.json', next.epubPath, next.epubPath],
      ['data/library.json', next.epubPath, 'data/novels/' + secondId + '/cover.jpg'],
    ]) expect(() => planAdditiveCatalogueUpload(original, nextCatalog, paths)).toThrow();
  });
  it('allows the first original ZIP without rewriting the EPUB or metadata', () => {
    const archive = 'data/novels/' + id + '/original.zip';
    const proposed: DatasetCatalogue = { version: 1, books: [{ ...base, archivePath: archive }] };
    const plan = planAdditiveCatalogueUpload(original, proposed, [archive, 'data/library.json']);
    expect(plan.operation).toBe('attach-archive');
    expect(plan.next.books[0].archivePath).toBe(archive);
    expect(() => planAdditiveCatalogueUpload(proposed, proposed, [archive, 'data/library.json'])).toThrow();
  });
  it('validates canonical paths, uniqueness, and catalogue types', () => {
    expect(parseDatasetCatalogue(original)).toEqual(original);
    for (const value of [
      { version: 1, books: [{ ...base, epubPath: '../secret' }] },
      { version: 1, books: [base, base] },
      { version: 1, books: [{ ...base, metadata: { id, title: '' } }] },
      { version: 4, books: [] },
      { version: 1, books: 'wrong' },
    ]) expect(() => parseDatasetCatalogue(value)).toThrow();
  });
});
