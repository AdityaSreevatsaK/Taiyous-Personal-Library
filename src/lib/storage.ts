import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { LibraryBook, ReaderSettings } from '../types';
import { DEFAULT_SETTINGS } from '../types';

interface NovelDB extends DBSchema {
  books: { key: string; value: LibraryBook };
  files: { key: string; value: { id: string; epub: Blob } };
  covers: { key: string; value: { id: string; jpeg: Blob } };
}

const DB_NAME = 'folio-personal-library-v1';
let database: Promise<IDBPDatabase<NovelDB>> | null = null;

function db(): Promise<IDBPDatabase<NovelDB>> {
  if (!database) {
    database = openDB<NovelDB>(DB_NAME, 2, {
      upgrade(upgradeDb) {
        // Upgrade the existing database in place. Do not delete EPUBs or notes.
        if (!upgradeDb.objectStoreNames.contains('books')) upgradeDb.createObjectStore('books', { keyPath: 'id' });
        if (!upgradeDb.objectStoreNames.contains('files')) upgradeDb.createObjectStore('files', { keyPath: 'id' });
        if (!upgradeDb.objectStoreNames.contains('covers')) upgradeDb.createObjectStore('covers', { keyPath: 'id' });
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

/** Cover art is downloaded only after authentication and stored for offline display. */
export async function getCachedCover(id: string): Promise<Blob | null> {
  return (await (await db()).get('covers', id))?.jpeg || null;
}

export async function cacheCover(id: string, jpeg: Blob): Promise<void> {
  if (!/^[0-9a-f]{24}$/.test(id) || jpeg.type !== 'image/jpeg' || jpeg.size > 8 * 1024 * 1024) {
    throw new Error('Invalid private cover artwork');
  }
  await (await db()).put('covers', { id, jpeg });
}

export async function updateBook(book: LibraryBook): Promise<void> {
  await (await db()).put('books', book);
}

/** Remove only the browser's EPUB copy. Metadata and cover remain unchanged.
 * The caller must first verify a working hosted backup and Owner mode.
 */
export async function removeCachedEpub(id: string): Promise<void> {
  await (await db()).delete('files', id);
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
    const legacyWidth = Number.isFinite(saved.readingWidth) ? saved.readingWidth! : DEFAULT_SETTINGS.readingWidth;
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
      theme: firstRunOfSepiaEdition ? 'sepia' : (['light', 'dark', 'sepia'].includes(saved.theme ?? '') ? saved.theme! : DEFAULT_SETTINGS.theme),
      font: ['literary', 'classic', 'georgia', 'sans', 'clear'].includes(saved.font ?? '') ? saved.font! : DEFAULT_SETTINGS.font,
      fontSize: Number.isFinite(saved.fontSize) ? Math.min(170, Math.max(75, saved.fontSize!)) : DEFAULT_SETTINGS.fontSize,
      lineHeight: Number.isFinite(saved.lineHeight) ? Math.min(2.2, Math.max(1.3, saved.lineHeight!)) : DEFAULT_SETTINGS.lineHeight,
      readingWidth: readingWidth === 0 ? 0 : Math.min(1600, Math.max(520, readingWidth)),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: ReaderSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* private mode / quota */ }
}
