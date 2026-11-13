import { describe, expect, it } from 'vitest';
import {
  coverPathForEntry, novelFolderFromEpubPath, parseNovelFilePath,
  readableNovelFolder, verifiedNovelFolder,
} from '../src/lib/novel-paths';
import { parseDatasetCatalogue, planAdditiveCatalogueUpload } from '../functions/_lib/catalogue';
import { isAllowedDatasetPath } from '../functions/api/library';

const id = 'a'.repeat(24);
const secondId = 'b'.repeat(24);
const legacy = 'data/novels/' + id;
const readable = legacy + " - A Knight's Return (Final)";
const chinese = legacy + ' - 修仙之路 第一卷';
const validEntries = [legacy, readable, chinese];

const make = (folder: string, title = 'The Renamed Book') => ({
  id, metadata: { id, title, coverPath: folder + '/cover.png' },
  epubPath: folder + '/source.epub',
  archivePath: folder + '/original.zip',
  coverPath: folder + '/cover.webp',
});

describe('controller-compatible dual novel folder contract', () => {
  it('accepts both legacy and readable folders, with all passive cover suffixes', () => {
    for (const folder of validEntries) {
      expect(novelFolderFromEpubPath(id, folder + '/source.epub')).toBe(folder);
      expect(verifiedNovelFolder(make(folder))).toBe(folder);
      for (const file of ['source.epub', 'original.zip', 'cover.jpg',
        'cover.jpeg', 'cover.png', 'cover.webp']) {
        const parsed = parseNovelFilePath(folder + '/' + file);
        expect(parsed?.directory).toBe(folder);
        expect(parsed?.id).toBe(id);
        expect(isAllowedDatasetPath(folder + '/' + file)).toBe(true);
      }
      expect(parseDatasetCatalogue({ version: 1, books: [make(folder)] }).books[0].id).toBe(id);
    }
  });

  it('does not reconstruct folders from renamed metadata titles', () => {
    const original = make(readable, 'Different book title from folder label');
    expect(verifiedNovelFolder(original)).toBe(readable);
    expect(coverPathForEntry({ ...original, coverPath: undefined })).toBe(readable + '/cover.png');
    expect(verifiedNovelFolder({ ...original, metadata: { ...original.metadata, title: 'Brand new title' } })).toBe(readable);
  });

  it('agrees with the Storage Controller sanitisation for new labels', () => {
    expect(readableNovelFolder(id, 'Martial World: Part 1 / Onward? (Final)'))
      .toBe(legacy + ' - Martial World Part 1 Onward (Final)');
    expect(readableNovelFolder(id, "A Knight's Return")).toBe(readable.replace(' (Final)', ''));
    const long = readableNovelFolder(id, '修仙之路 ' + 'A'.repeat(200));
    expect(Array.from(long.slice((legacy + ' - ').length)).length).toBeLessThanOrEqual(96);
    expect(long).toContain('修仙之路');
  });

  it('refuses cross-book ZIP, wrong cover folder, unsafe label and traversal', () => {
    const forbidden = [
      'data/novels/' + secondId + '/source.epub',
      legacy + ' - ../source.epub',
      legacy + ' - Evil/../source.epub',
      legacy + ' - Evil/../../source.epub',
      legacy + ' - Leading./source.epub',
      legacy + ' - .Hidden/source.epub',
      legacy + ' - Doubled..Dots/source.epub',
      legacy + ' - Back\\Slash/source.epub',
      legacy + ' - encoded%2fslash/source.epub',
      legacy + ' - Encoded#Hash/source.epub',
      legacy + ' - An/other/source.epub',
      legacy + '/evil.svg',
      legacy + '/other.zip',
      legacy + '/source.epub/extra',
      'data/novels/' + id.toUpperCase() + '/source.epub',
    ];
    for (const path of forbidden) {
      if (path === 'data/novels/' + secondId + '/source.epub') {
        expect(novelFolderFromEpubPath(id, path)).toBeNull();
      } else {
        expect(parseNovelFilePath(path)).toBeNull();
        expect(isAllowedDatasetPath(path)).toBe(false);
      }
    }
    expect(verifiedNovelFolder({ ...make(readable), archivePath: legacy + '/original.zip' })).toBeNull();
    expect(verifiedNovelFolder({ ...make(readable), coverPath: legacy + '/cover.jpg' })).toBeNull();
    expect(verifiedNovelFolder({ ...make(readable), metadata: { id, title: 'X', coverPath: legacy + '/cover.png' } })).toBeNull();
  });

  it('preserves add-only constraints and attaches original ZIP to the SAME readable folder', () => {
    const old = { id, metadata: { id, title: 'Old Name' }, epubPath: readable + '/source.epub' };
    const newer = { ...old, archivePath: readable + '/original.zip' };
    const original = { version: 1 as const, books: [old] };
    const planned = { version: 1 as const, books: [newer] };
    expect(planAdditiveCatalogueUpload(original, planned, [newer.archivePath, 'data/library.json']).operation)
      .toBe('attach-archive');
    expect(() => planAdditiveCatalogueUpload(original, {
      version: 1 as const, books: [{ ...old, archivePath: legacy + '/original.zip' }],
    }, [legacy + '/original.zip', 'data/library.json'])).toThrow();
    expect(() => planAdditiveCatalogueUpload(original, {
      version: 1 as const, books: [],
    }, [newer.archivePath, 'data/library.json'])).toThrow();
  });

  it('permits a mixed catalogue and rejects unverified new covers', () => {
    const another = { id: secondId, metadata: { id: secondId, title: 'Another' },
      epubPath: 'data/novels/' + secondId + '/source.epub' };
    const current = { version: 1 as const, books: [make(readable), another] };
    expect(parseDatasetCatalogue(current).books).toHaveLength(2);
    const newId = 'c'.repeat(24), newFolder = 'data/novels/' + newId + ' - Fresh Book';
    const addition = { id: newId, metadata: { id: newId, title: 'Fresh Book' },
      epubPath: newFolder + '/source.epub' };
    const proposal = { version: 1 as const, books: [...current.books, addition] };
    expect(planAdditiveCatalogueUpload(current, proposal, [addition.epubPath, 'data/library.json']).operation)
      .toBe('add');
    const unverified = { ...addition, metadata: { ...addition.metadata, coverPath: newFolder + '/cover.png' } };
    expect(() => planAdditiveCatalogueUpload(current, {
      version: 1 as const, books: [...current.books, unverified],
    }, [unverified.epubPath, 'data/library.json'])).toThrow(/unverified cover/);
  });
});
