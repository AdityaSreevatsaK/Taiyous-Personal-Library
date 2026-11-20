import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LibraryBook, ReaderSettings } from '../types';
import { readerDefaultsForViewport } from '../types';
import { isReaderTheme } from './themes';

interface NovelDB extends DBSchema {
  books: { key: string; value: LibraryBook };
  files: { key: string; value: { id: string; epub: Blob } };
  covers: { key: string; value: { id: string; jpeg: Blob } };
  archivedBooks: { key: string; value: { id: string; book: LibraryBook; archivedAt: number } };
}

const DB_NAME = 'folio-personal-library-v1';
let database: Promise<IDBPDatabase<NovelDB>> | null = null;

function db(): Promise<IDBPDatabase<NovelDB>> {
  if (!database) {
    database = openDB<NovelDB>(DB_NAME, 3, {
      upgrade(upgradeDb) {
        // Upgrade the existing database in place. Do not delete EPUBs or notes.
        if (!upgradeDb.objectStoreNames.contains('books')) upgradeDb.createObjectStore('books', { keyPath: 'id' });
        if (!upgradeDb.objectStoreNames.contains('files')) upgradeDb.createObjectStore('files', { keyPath: 'id' });
        if (!upgradeDb.objectStoreNames.contains('covers')) upgradeDb.createObjectStore('covers', { keyPath: 'id' });
        if (!upgradeDb.objectStoreNames.contains('archivedBooks')) upgradeDb.createObjectStore('archivedBooks', { keyPath: 'id' });
      },
    }).catch((error: unknown) => {
      database = null;
      throw error;
    });
  }
  return database!;
}

export async function getBooks(): Promise<LibraryBook[]> {
  const result = await (await db()).getAll('books');
  return result.sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
}

export async function saveBook(book: LibraryBook, epub: Blob): Promise<void> {
  const database = await db();
  const tx = database.transaction(['books', 'files'], 'readwrite');
  await Promise.all([tx.objectStore('books').put(book), tx.objectStore('files').put({ id: book.id, epub })]);
  await tx.done;
}

/** Cached EPUB IDs in browser IndexedDB; does not access private cloud. */
export async function getCachedEpubIds(): Promise<string[]> {
  return (await (await db()).getAllKeys('files')).map(String);
}

export async function getBookFile(id: string): Promise<Blob> {
  const asset = await (await db()).get('files', id);
  if (!asset) throw new Error('The EPUB file could not be found. Please re-import this novel.');
  return asset.epub;
}

/** Signature-check passive cover formats before persisting private artwork.
 * Keep the historical IndexedDB 'jpeg' property for backwards compatibility:
 * older data are JPEG, newer values can also be PNG or WebP.
 */
export async function isSafeCachedCover(image: Blob): Promise<boolean> {
  if (image.size < 4 || image.size > 8 * 1024 * 1024 ||
      !['image/jpeg', 'image/png', 'image/webp'].includes(image.type)) return false;
  const header = new Uint8Array(await image.slice(0, 12).arrayBuffer());
  if (image.type === 'image/jpeg') {
    return header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
  }
  if (image.type === 'image/png') {
    return header.length >= 8 &&
      [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => header[index] === byte);
  }
  return header.length >= 12 &&
    String.fromCharCode(...header.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...header.slice(8, 12)) === 'WEBP';
}

/** Cover art is downloaded only after authentication and stored for offline display. */
export async function getCachedCover(id: string): Promise<Blob | null> {
  return (await (await db()).get('covers', id))?.jpeg || null;
}

export async function cacheCover(id: string, image: Blob): Promise<void> {
  if (!/^[0-9a-f]{24}$/.test(id) || !(await isSafeCachedCover(image))) {
    throw new Error('Invalid private cover artwork');
  }
  await (await db()).put('covers', { id, jpeg: image });
}

export async function updateBook(book: LibraryBook): Promise<void> {
  await (await db()).put('books', book);
}

/** Persist one cloud refresh's metadata in a single IndexedDB transaction.
 * Previously hundreds of individual readwrite transactions were launched
 * simultaneously, adding scheduling overhead and write contention.
 * A failed batch rejects as one operation; nothing touches EPUBs or covers.
 */
export async function updateBooks(books: readonly LibraryBook[]): Promise<void> {
  if (!books.length) return;
  const tx = (await db()).transaction('books', 'readwrite');
  const store = tx.objectStore('books');
  await Promise.all(books.map(book => store.put(book)));
  await tx.done;
}

/** Remove only the browser's EPUB copy. Metadata and cover remain unchanged.
 * The caller must first verify a working hosted backup and Owner mode.
 */
export async function removeCachedEpub(id: string): Promise<void> {
  await (await db()).delete('files', id);
}

/** Move stale metadata into a recoverable browser archive in one IndexedDB
 * transaction. Never touch EPUB files or cover blobs. The caller must supply
 * a freshly verified authoritative hosted catalogue before invoking this.
 */
export async function archiveStaleBookRecords(hostedIds: readonly string[]): Promise<number> {
  const transaction = (await db()).transaction(['books', 'files', 'archivedBooks'], 'readwrite');
  const books = transaction.objectStore('books');
  const archives = transaction.objectStore('archivedBooks');
  const [records, epubIds] = await Promise.all([
    books.getAll(), transaction.objectStore('files').getAllKeys(),
  ]);
  const hosted = new Set(hostedIds);
  const cached = new Set(epubIds.map(String));
  const stale = records.filter(record => !hosted.has(record.id) && !cached.has(record.id));
  for (const record of stale) {
    await archives.put({ id: record.id, book: record, archivedAt: Date.now() });
    await books.delete(record.id);
  }
  await transaction.done;
  return stale.length;
}

/** If the private dataset is later restored, return matching archived notes
 * to the active records. Never overwrite a newer local record.
 */
export async function restoreReappearedArchivedRecords(hostedIds: readonly string[]): Promise<number> {
  if (!hostedIds.length) return 0;
  const transaction = (await db()).transaction(['books', 'archivedBooks'], 'readwrite');
  const active = transaction.objectStore('books');
  const archived = transaction.objectStore('archivedBooks');
  let restored = 0;
  for (const id of new Set(hostedIds)) {
    const record = await archived.get(id);
    if (!record) continue;
    if (!(await active.get(id))) {
      await active.put(record.book);
      await archived.delete(id);
      restored++;
    }
    // If an active book already exists, keep BOTH it and its archived
    // recovery copy. Never discard a potentially newer local annotation.
  }
  await transaction.done;
  return restored;
}

/** Make a durable local metadata/reading-state snapshot before the separately
 * authorised whole-novel deletion; the EPUB must also be exported independently.
 */
export async function preserveNovelMetadataForDeletion(id: string): Promise<void> {
  const transaction = (await db()).transaction(['books', 'archivedBooks'], 'readwrite');
  const record = await transaction.objectStore('books').get(id);
  if (!record) throw new Error('Novel no longer exists; deletion refused.');
  await transaction.objectStore('archivedBooks').put({ id, book: record, archivedAt: Date.now() });
  await transaction.done;
}

/** Archived annotations are retained for recovery and can be exported as JSON. */
export async function getArchivedBookRecords(): Promise<LibraryBook[]> {
  return (await (await db()).getAll('archivedBooks')).map(entry => entry.book);
}

export async function deleteBook(id: string): Promise<void> {
  const tx = (await db()).transaction(['books', 'files', 'covers'], 'readwrite');
  await Promise.all([tx.objectStore('books').delete(id), tx.objectStore('files').delete(id), tx.objectStore('covers').delete(id)]);
  await tx.done;
}

const SETTINGS_KEY = 'folio.reader-settings.v1';
const SEPIA_MIGRATION_KEY = 'taiyou.sepia-default-applied.v0.3.0';
const WIDTH_MIGRATION_KEY = 'taiyou.full-width-default-applied.v0.4.0';
// v0.5 still allowed a stale narrow column from previously saved preferences.
// Apply the user's explicit full-width choice once, then respect later changes.
const WIDTH_FIX_KEY = 'taiyou.full-width-explicit-v0.6.0';

export function readSettings(): ReaderSettings {
  const defaults = readerDefaultsForViewport(
    typeof window !== 'undefined' && window.matchMedia?.('(max-width: 700px)').matches === true,
  );
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') as Partial<ReaderSettings>;
    // This personal-library upgrade explicitly switches its owner's starting
    // theme to sepia once, while preserving all other reading preferences.
    const firstRunOfSepiaEdition = localStorage.getItem(SEPIA_MIGRATION_KEY) !== 'yes';
    if (firstRunOfSepiaEdition) localStorage.setItem(SEPIA_MIGRATION_KEY, 'yes');
    // The 680 px default left excessive unused space on desktop. Convert only
    // that former default to full width once, preserving deliberate custom widths.
    const firstRunOfWidthEdition = localStorage.getItem(WIDTH_MIGRATION_KEY) !== 'yes';
    if (firstRunOfWidthEdition) localStorage.setItem(WIDTH_MIGRATION_KEY, 'yes');
    const legacyWidth = Number.isFinite(saved.readingWidth) ? saved.readingWidth! : defaults.readingWidth;
    const widthFixNeeded = localStorage.getItem(WIDTH_FIX_KEY) !== 'yes';
    if (widthFixNeeded) {
      // Persist immediately because React StrictMode can invoke the state
      // initializer twice before effects have written the migrated settings.
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...saved, readingWidth: 0 }));
      localStorage.setItem(WIDTH_FIX_KEY, 'yes');
    }
    // One-time upgrade: reset the prior (possibly narrow) saved setting to Full Width.
    // Afterwards Comfortable/Wide/custom choices are kept as usual.
    const readingWidth = widthFixNeeded ? 0 : (firstRunOfWidthEdition && legacyWidth === 680 ? 0 : legacyWidth);
    return {
      theme: firstRunOfSepiaEdition ? 'sepia' : (isReaderTheme(saved.theme) ? saved.theme : defaults.theme),
      font: ['literary', 'classic', 'georgia', 'sans', 'clear'].includes(saved.font ?? '') ? saved.font! : defaults.font,
      fontSize: Number.isFinite(saved.fontSize) ? Math.min(170, Math.max(75, saved.fontSize!)) : defaults.fontSize,
      lineHeight: Number.isFinite(saved.lineHeight) ? Math.min(2.2, Math.max(1.3, saved.lineHeight!)) : defaults.lineHeight,
      readingWidth: readingWidth === 0 ? 0 : Math.min(1600, Math.max(520, readingWidth)),
    };
  } catch {
    return defaults;
  }
}

export function writeSettings(settings: ReaderSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode / quota */ }
}
