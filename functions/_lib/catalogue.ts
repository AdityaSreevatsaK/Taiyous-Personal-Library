/**
 * Dataset catalogue mutation guard. The reader may ADD a novel or attach
 * its first original ZIP, but it may never replace/remove existing catalogue
 * entries via the normal OAuth upload endpoint. Whole-novel deletion has its
 * own authenticated Owner-mode API.
 */
export interface CatalogueEntry {
  id: string;
  metadata: { id: string; title: string; [key: string]: unknown };
  epubPath: string;
  archivePath?: string;
  coverPath?: string;
  [key: string]: unknown;
}
export interface DatasetCatalogue {
  version: 1;
  books: CatalogueEntry[];
}
export type AdditivePlan = {
  next: DatasetCatalogue;
  novelId: string;
  operation: 'add' | 'attach-archive';
};
const NOVEL_ID = /^[0-9a-f]{24}$/;
export const CATALOGUE_LIMIT = 4 * 1024 * 1024;

function canonical(entry: CatalogueEntry): boolean {
  const prefix = 'data/novels/' + entry.id + '/';
  return NOVEL_ID.test(entry.id) &&
    entry.metadata?.id === entry.id &&
    typeof entry.metadata.title === 'string' &&
    entry.metadata.title.trim().length > 0 &&
    entry.metadata.title.length <= 255 &&
    entry.epubPath === prefix + 'source.epub' &&
    (entry.archivePath === undefined || entry.archivePath === prefix + 'original.zip') &&
    (entry.coverPath === undefined || entry.coverPath === prefix + 'cover.jpg');
}

export function parseDatasetCatalogue(value: unknown): DatasetCatalogue {
  if (!value || typeof value !== 'object') throw new Error('Invalid dataset catalogue');
  const raw = value as Partial<DatasetCatalogue>;
  if (raw.version !== 1 || !Array.isArray(raw.books) || raw.books.length > 30000) {
    throw new Error('Unsupported dataset catalogue');
  }
  const ids = new Set<string>();
  for (const item of raw.books) {
    if (!item || typeof item !== 'object' || !canonical(item) || ids.has(item.id)) {
      throw new Error('Invalid, duplicated or noncanonical novel catalogue entry');
    }
    ids.add(item.id);
  }
  return raw as DatasetCatalogue;
}

/** Verifies that proposed changes cannot remove, rewrite or orphan a book. */
export function planAdditiveCatalogueUpload(
  current: DatasetCatalogue,
  proposed: DatasetCatalogue,
  suppliedPaths: string[],
): AdditivePlan {
  if (suppliedPaths.filter(path => path === 'data/library.json').length !== 1 ||
      new Set(suppliedPaths).size !== suppliedPaths.length ||
      suppliedPaths.length < 2 || suppliedPaths.length > 3) {
    throw new Error('A catalogue addition must include its novel files exactly once');
  }
  const old = new Map(current.books.map(book => [book.id, book]));
  const next = new Map(proposed.books.map(book => [book.id, book]));
  if (next.size !== proposed.books.length || next.size < old.size) {
    throw new Error('The normal upload endpoint cannot delete novels');
  }
  const added = proposed.books.filter(book => !old.has(book.id));
  const changed = proposed.books.filter(book => old.has(book.id) &&
    JSON.stringify(old.get(book.id)) !== JSON.stringify(book));
  if (current.books.some(book => !next.has(book.id))) {
    throw new Error('The normal upload endpoint cannot remove existing catalogue entries');
  }
  if (added.length === 1 && changed.length === 0) {
    const book = added[0];
    // Covers are managed via the storage controller, not arbitrary web uploads.
    if (book.coverPath) throw new Error('A new novel cannot declare an unverified cover');
    const required = [book.epubPath, ...(book.archivePath ? [book.archivePath] : [])];
    const supplied = suppliedPaths.filter(path => path !== 'data/library.json');
    if (required.length !== supplied.length ||
        required.some(path => !supplied.includes(path))) {
      throw new Error('The new novel must include the exact declared EPUB and optional ZIP');
    }
    // Build from the verified server state, never replace it with client JSON.
    return { next: { version: 1, books: [...current.books, book] },
      novelId: book.id, operation: 'add' };
  }
  if (added.length === 0 && changed.length === 1 && next.size === old.size) {
    const newer = changed[0], older = old.get(newer.id)!;
    const { archivePath: _ignored, ...withoutArchive } = newer;
    // The only permitted existing-book mutation is adding its first ZIP path.
    if (older.archivePath === undefined &&
        newer.archivePath === 'data/novels/' + newer.id + '/original.zip' &&
        JSON.stringify(withoutArchive) === JSON.stringify(older) &&
        suppliedPaths.length === 2 &&
        suppliedPaths.includes(newer.archivePath)) {
      return { next: { version: 1, books: current.books.map(item =>
        item.id === newer.id ? newer : item) },
        novelId: newer.id, operation: 'attach-archive' };
    }
  }
  throw new Error('A stale or destructive catalogue replacement was refused; refresh and retry');
}
