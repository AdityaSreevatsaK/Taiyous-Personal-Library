import { uploadFiles } from '@huggingface/hub';
import type { LibraryBook, ImportedBook } from '../types';

/**
 * The private HF Dataset is accessed through our same-origin Cloudflare Pages
 * OAuth gateway. The gateway holds HF access tokens in encrypted HttpOnly cookies.
 * Manual fine-grained tokens are a fallback, retained in React memory only.
 */
export interface CloudSession {
  accessToken: string;
  expiresAt: number;
  username: string;
  /** HF OAuth gateway session, authenticated with an HttpOnly same-origin cookie. */
  via?: 'oauth';
}

export interface CloudEntry {
  id: string;
  metadata: LibraryBook;
  epubPath: string;
  archivePath?: string;
  /** Cover uploaded by the cover-manifest pipeline, keyed by this existing novel ID. */
  coverPath?: string;
}

export interface CloudCatalog { version: 1; books: CloudEntry[] }

export const CLOUD_DATASET_KEY = 'taiyou.hf-dataset-repo.v1';
const LEGACY_SESSION_KEY = 'taiyou.hf-oauth-session.v1';
const ID_PATTERN = /^[0-9a-f]{24}$/;
const REPO_PATTERN = /^[A-Za-z0-9][\w.-]{0,95}\/[A-Za-z0-9][\w.-]{0,95}$/;
const emptyCatalog = (): CloudCatalog => ({ version: 1, books: [] });

export function validateDatasetRepo(value: string): string {
  const id = value.trim();
  if (!REPO_PATTERN.test(id) || id.includes('..')) throw new Error('Enter your private dataset as username/repository-name.');
  return id;
}

export function readDatasetRepo(): string {
  try { return localStorage.getItem(CLOUD_DATASET_KEY) || import.meta.env.VITE_HF_DATASET_REPO || ''; }
  catch { return import.meta.env.VITE_HF_DATASET_REPO || ''; }
}

export function saveDatasetRepo(repo: string): void {
  localStorage.setItem(CLOUD_DATASET_KEY, validateDatasetRepo(repo));
}

export function clearCloudSession(): void {
  // Erase credentials retained by v1.0.3 and earlier OAuth versions.
  try { sessionStorage.removeItem(LEGACY_SESSION_KEY); } catch { /* storage denied */ }
}

export function createCloudSession(repo: string, rawToken: string): CloudSession {
  validateDatasetRepo(repo);
  const accessToken = rawToken.trim();
  if (!/^hf_[A-Za-z0-9]{12,}$/.test(accessToken)) {
    throw new Error('Enter a valid Hugging Face access token starting with hf_.');
  }
  // A repo-scoped token remains valid until it is revoked; it is never persisted.
  return { accessToken, username: 'Private dataset', expiresAt: Number.MAX_SAFE_INTEGER };
}

/** Detect a server-side Hugging Face OAuth session without exposing an HF token. */
export async function discoverHostedOAuthSession(): Promise<{ repo: string; session: CloudSession } | null> {
  if (!navigator.onLine) return null;
  try {
    const response = await fetch('/api/library?action=session', {
      credentials: 'same-origin', cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return null;
    const value = await response.json() as { connected?: boolean; repo?: string };
    if (!value.connected || !value.repo) return null;
    const repo = validateDatasetRepo(value.repo);
    return { repo, session: { via: 'oauth', accessToken: '', expiresAt: Number.MAX_SAFE_INTEGER, username: 'Hugging Face' } };
  } catch { return null; }
}

function proxyFileUrl(path: string): string {
  return '/api/library?action=file&path=' + encodeURIComponent(path);
}

/** Upload only allowlisted dataset paths. OAuth sessions never send a token. */
export async function uploadPrivateDatasetFiles(
  repo: string, session: CloudSession,
  files: Array<{ path: string; content: Blob }>, commitTitle: string,
): Promise<void> {
  const id = validateDatasetRepo(repo);
  if (session.via !== 'oauth') {
    // A raw HF token cannot use the server's revision-bound catalogue guard.
    // Keep legacy reading and personal-note writes, but prevent this UI from
    // silently overwriting hosted novels or the authoritative book listing.
    if (files.some(file => file.path === 'data/library.json' || file.path.startsWith('data/novels/'))) {
      throw new Error('Adding or changing cloud novels requires Hugging Face OAuth sign-in. The legacy token connection is limited to personal notes and reading progress.');
    }
    await uploadFiles({
      repo: { type: 'dataset', name: id }, accessToken: session.accessToken,
      files, commitTitle,
    });
    return;
  }
  const data = new FormData();
  data.set('title', commitTitle.slice(0, 130));
  for (const item of files) {
    data.append('path', item.path);
    data.append('file', item.content, item.path.split('/').at(-1) || 'file');
  }
  const response = await fetch('/api/library?action=upload', {
    method: 'POST', credentials: 'same-origin', body: data, cache: 'no-store',
    headers: { 'X-Taiyou-Request': 'dataset-upload' },
  });
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { error?: string };
    const explanation = typeof details.error === 'string' ? details.error.slice(0, 300) : '';
    if (response.status === 409) {
      throw new Error('Cloud dataset conflict or recovery required: ' + (explanation || 'refresh your library before retrying.'));
    }
    throw new Error('Private dataset upload failed (' + response.status + '). ' +
      (explanation || 'Sign in with Hugging Face again if needed.'));
  }
}

function resolveUrl(repo: string, path: string): string {
  const repoId = validateDatasetRepo(repo);
  if (!/^data\/[\w/-]+\.(epub|zip|json|jpg)$/.test(path) || path.includes('..')) throw new Error('Invalid library file path.');
  return `https://huggingface.co/datasets/${repoId}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`;
}

/** Refuse to upload book content to an accidentally public dataset. */
export async function assertPrivateDataset(repo: string, session: CloudSession): Promise<void> {
  const repoId = validateDatasetRepo(repo);
  if (session.expiresAt <= Date.now() + 30_000) throw new Error('Hugging Face authorisation expired. Sign in again.');
  const result = session.via === 'oauth'
    ? await fetch('/api/library?action=info', { credentials: 'same-origin', cache: 'no-store' })
    : await fetch(`https://huggingface.co/api/datasets/${repoId}`, {
        headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store',
      });
  if (!result.ok) throw new Error(`Cannot access the private dataset ${repoId} (${result.status}). Create it and grant your account access.`);
  const info = await result.json() as { private?: boolean };
  if (info.private !== true) throw new Error(`Dataset ${repoId} is NOT PRIVATE. Change its visibility to Private before importing novels.`);
}

async function privateGet(repo: string, path: string, session: CloudSession): Promise<Response> {
  if (session.expiresAt <= Date.now() + 30_000) throw new Error('Hugging Face authorisation expired. Sign in again.');
  const response = session.via === 'oauth'
    ? await fetch(proxyFileUrl(path), { credentials: 'same-origin', cache: 'no-store' })
    : await fetch(resolveUrl(repo, path), {
        headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store',
      });
  if ([401, 403].includes(response.status)) throw new Error('Cannot access the private novel dataset. Check your Hugging Face account and repository permissions.');
  return response;
}

function validEntry(entry: unknown): entry is CloudEntry {
  if (!entry || typeof entry !== 'object') return false;
  const value = entry as Partial<CloudEntry>;
  return typeof value.id === 'string' && ID_PATTERN.test(value.id)
    && value.metadata?.id === value.id
    && typeof value.metadata.title === 'string'
    && value.epubPath === `data/novels/${value.id}/source.epub`
    && (!value.archivePath || value.archivePath === `data/novels/${value.id}/original.zip`)
    && (value.coverPath === undefined || value.coverPath === `data/novels/${value.id}/cover.jpg`);
}

export async function fetchCloudCatalog(repo: string, session: CloudSession): Promise<CloudCatalog> {
  await assertPrivateDataset(repo, session);
  const response = await privateGet(repo, 'data/library.json', session);
  if (response.status === 404) {
    // The hosted Pages Function verifies that no data/ files remain before it
    // returns 404. Legacy manual-token mode has to make the equivalent check.
    if (session.via !== 'oauth') {
      const tree = await fetch('https://huggingface.co/api/datasets/' + validateDatasetRepo(repo) +
        '/tree/main/data?recursive=true&limit=1', {
          headers: { Authorization: 'Bearer ' + session.accessToken }, cache: 'no-store',
        });
      if (tree.status !== 404) {
        if (!tree.ok) throw new Error('Could not inspect private dataset files; catalogue recovery check failed.');
        const items = await tree.json() as unknown;
        if (!Array.isArray(items)) throw new Error('Could not verify private dataset files.');
        if (items.length) throw new Error('Recovery required: private dataset files exist but data/library.json is missing. No new catalogue will be created.');
      }
    }
    return emptyCatalog();
  }
  if (!response.ok) {
    const details = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(typeof details.error === 'string'
      ? details.error.slice(0, 300)
      : 'Could not retrieve cloud catalogue (' + response.status + '). Check your private dataset.');
  }
  const result = await response.json() as CloudCatalog;
  if (result.version !== 1 || !Array.isArray(result.books) || result.books.some((e) => !validEntry(e))) {
    throw new Error('The remote data/library.json catalogue is invalid or uses an unsupported format.');
  }
  return result;
}

/** Retrieve cover artwork from the same private dataset; never expose a bearer token as an image URL. */
export async function fetchCloudCover(repo: string, book: Pick<LibraryBook, 'id' | 'coverPath'>, session: CloudSession): Promise<Blob | null> {
  const path = book.coverPath;
  if (!path || !ID_PATTERN.test(book.id) || path !== `data/novels/${book.id}/cover.jpg`) return null;
  const response = await privateGet(repo, path, session);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to retrieve private cover (${response.status}).`);
  const blob = await response.blob();
  // Only allow plausible JPEG artwork. Never parse or display active image formats.
  if (blob.size < 4 || blob.size > 8 * 1024 * 1024) return null;
  const header = new Uint8Array(await blob.slice(0, 3).arrayBuffer());
  if (header[0] !== 0xff || header[1] !== 0xd8 || header[2] !== 0xff) return null;
  return new Blob([blob], { type: 'image/jpeg' });
}

/** Verify a hosted EPUB actually exists without downloading its contents.
 * This is required before deleting a device's offline EPUB.
 */
/** Permanently remove a cloud-hosted novel after separate Owner-mode approval.
 * This endpoint never accepts arbitrary paths and never exposes the OAuth token.
 */
export async function deleteCloudNovel(book: Pick<LibraryBook, 'id' | 'title'>): Promise<void> {
  if (!/^[a-f0-9]{24}$/.test(book.id)) throw new Error('Invalid novel identifier');
  const response = await fetch('/api/library?action=delete-novel', {
    method: 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'X-Taiyou-Request': 'owner-delete-novel' },
    body: JSON.stringify({ id: book.id, title: book.title }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(result.error || 'Unable to remove hosted novel');
  }
}

export async function hostedEpubExists(_repo: string, entry: CloudEntry, session: CloudSession): Promise<boolean> {
  if (!validEntry(entry) || session.via !== 'oauth') return false;
  const response = await fetch('/api/library?action=exists&path=' + encodeURIComponent(entry.epubPath), {
    credentials: 'same-origin', cache: 'no-store',
  });
  if (!response.ok) return false;
  return (await response.json() as { exists?: boolean }).exists === true;
}

export async function fetchCloudEpub(repo: string, entry: CloudEntry, session: CloudSession): Promise<Blob> {
  if (!validEntry(entry)) throw new Error('Invalid cloud novel entry.');
  const response = await privateGet(repo, entry.epubPath, session);
  if (!response.ok) throw new Error(`Unable to download ${entry.metadata.title} (${response.status}).`);
  const blob = await response.blob();
  if (!blob.size || blob.size > 120 * 1024 * 1024) throw new Error('The hosted EPUB is empty or too large.');
  return blob;
}

/** Per-book reading state is private and independent of catalogue/EPUB data. */
export interface CloudReadingProgress {
  version: 1;
  bookId: string;
  progress: number;
  currentChapter: string | null;
  currentChapterIndex: number | null;
  currentChapterNumber: number | null;
  lastCfi: string | null;
  lastOpenedAt: number | null;
  updatedAt: number;
}

function readingProgressPath(id: string): string {
  if (!ID_PATTERN.test(id)) throw new Error('Invalid book identifier for reading progress.');
  return `data/personal/progress/${id}.json`;
}

export function validateReadingProgress(value: unknown, bookId: string): CloudReadingProgress {
  if (!value || typeof value !== 'object') throw new Error('Invalid reading progress document.');
  const raw = value as Partial<CloudReadingProgress>;
  const optionalText = (v: unknown, limit: number) => v === null || (typeof v === 'string' && v.length <= limit);
  const optionalInteger = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0);
  if (raw.version !== 1 || raw.bookId !== bookId ||
      typeof raw.progress !== 'number' || !Number.isFinite(raw.progress) || raw.progress < 0 || raw.progress > 100 ||
      !optionalText(raw.currentChapter, 600) || !optionalText(raw.lastCfi, 4000) ||
      !optionalInteger(raw.currentChapterIndex) || !optionalInteger(raw.currentChapterNumber) ||
      !optionalInteger(raw.lastOpenedAt) || !optionalInteger(raw.updatedAt) || raw.updatedAt === null) {
    throw new Error('Invalid private reading progress fields.');
  }
  return raw as CloudReadingProgress;
}

export function applyCloudReadingProgress(book: LibraryBook, remote: CloudReadingProgress): LibraryBook {
  if (book.id !== remote.bookId || remote.updatedAt < (book.progressUpdatedAt ?? 0)) return book;
  return { ...book, progress: remote.progress,
    currentChapter: remote.currentChapter ?? undefined,
    currentChapterIndex: remote.currentChapterIndex ?? undefined,
    currentChapterNumber: remote.currentChapterNumber ?? undefined,
    lastCfi: remote.lastCfi ?? undefined,
    lastOpenedAt: remote.lastOpenedAt ?? undefined,
    progressUpdatedAt: remote.updatedAt, pendingProgressSync: false };
}

export async function fetchCloudReadingProgress(repo: string, bookId: string, session: CloudSession): Promise<CloudReadingProgress | null> {
  const response = await privateGet(repo, readingProgressPath(bookId), session);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to fetch private reading progress (${response.status}).`);
  return validateReadingProgress(await response.json(), bookId);
}

export async function saveCloudReadingProgress(repo: string, bookId: string, session: CloudSession, book: LibraryBook): Promise<CloudReadingProgress> {
  await assertPrivateDataset(repo, session);
  const progress = validateReadingProgress({
    version: 1, bookId, progress: book.progress,
    currentChapter: book.currentChapter ?? null,
    currentChapterIndex: book.currentChapterIndex ?? null,
    currentChapterNumber: book.currentChapterNumber ?? null,
    lastCfi: book.lastCfi ?? null,
    lastOpenedAt: book.lastOpenedAt ?? null,
    updatedAt: book.progressUpdatedAt ?? book.lastOpenedAt ?? Date.now(),
  }, bookId);
  await uploadPrivateDatasetFiles(repo, session, [
    { path: readingProgressPath(bookId), content: new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' }) },
  ], 'Sync private reading progress');
  return progress;
}

/** Private, device-independent annotations; never mixed into the shared novel catalogue. */
export interface CloudPersonalReview {
  version: 1;
  bookId: string;
  rating: number | null;
  comments: string;
  /** Saved with private notes so the Trying out shelf follows the owner across devices. */
  shelfStatus?: 'trying' | null;
  updatedAt: number;
}

function personalReviewPath(bookId: string): string {
  if (!ID_PATTERN.test(bookId)) throw new Error('Invalid novel ID for personal notes.');
  return `data/personal/reviews/${bookId}.json`;
}

export function parseCloudPersonalReview(value: unknown, bookId: string): CloudPersonalReview {
  if (!value || typeof value !== 'object') throw new Error('Invalid personal review document.');
  const note = value as Partial<CloudPersonalReview>;
  if (note.version !== 1 || note.bookId !== bookId ||
    !(note.rating === null || (Number.isInteger(note.rating) && typeof note.rating === 'number' && note.rating >= 1 && note.rating <= 10)) ||
    typeof note.comments !== 'string' || note.comments.length > 10000 ||
    !(note.shelfStatus === undefined || note.shelfStatus === null || note.shelfStatus === 'trying') ||
    typeof note.updatedAt !== 'number' || !Number.isFinite(note.updatedAt) || note.updatedAt < 0) {
    throw new Error('Unsupported personal review document.');
  }
  return note as CloudPersonalReview;
}

export async function fetchCloudPersonalReview(repo: string, bookId: string, session: CloudSession): Promise<CloudPersonalReview | null> {
  const response = await privateGet(repo, personalReviewPath(bookId), session);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Unable to load synced notes for this novel (${response.status}).`);
  return parseCloudPersonalReview(await response.json(), bookId);
}

/** Write a single book's annotation, never a catalogue or EPUB. */
export async function saveCloudPersonalReview(
  repo: string, bookId: string, session: CloudSession, rating: number | undefined, comments: string, updatedAt: number,
  shelfStatus?: 'trying',
): Promise<CloudPersonalReview> {
  await assertPrivateDataset(repo, session);
  const value = parseCloudPersonalReview({
    version: 1, bookId, rating: rating ?? null, comments: comments.trim().slice(0, 10000), updatedAt,
    shelfStatus: shelfStatus ?? null,
  }, bookId);
  await uploadPrivateDatasetFiles(repo, session, [
    { path: personalReviewPath(bookId), content: new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }) },
  ], 'Update private reading notes');
  return value;
}

export async function fetchCloudArchive(repo: string, entry: CloudEntry, session: CloudSession): Promise<Blob> {
  if (!validEntry(entry) || !entry.archivePath) throw new Error('No original ZIP archive is available for this novel.');
  const response = await privateGet(repo, entry.archivePath, session);
  if (!response.ok) throw new Error(`Unable to download original ZIP (${response.status}).`);
  const blob = await response.blob();
  if (!blob.size) throw new Error('The original ZIP is empty.');
  return blob;
}

function cloudMetadata(book: LibraryBook): LibraryBook {
  // Personal tags, reading position and per-device timestamps are NOT published.
  return {
    id: book.id, title: book.title, author: book.author, language: book.language,
    chapterCount: book.chapterCount, description: book.description,
    sourceTags: book.sourceTags, sourceUrl: book.sourceUrl, coverPath: book.coverPath,
    status: book.status, metadataScanned: book.metadataScanned,
    originalFileName: book.originalFileName, importedAt: book.importedAt,
    size: book.size, personalTags: [], progress: 0, cloud: true,
  };
}

/** Cloudflare Pages has a lower upload body budget than the local storage controller. */
export function validateCloudNovelUploadSize(epubBytes: number, originalBytes: number, includesZip: boolean): void {
  const MiB = 1024 * 1024;
  const total = epubBytes + (includesZip ? originalBytes : 0);
  if (epubBytes > 70 * MiB || (includesZip && originalBytes > 70 * MiB) || total > 74 * MiB) {
    throw new Error('This novel exceeds the website upload limit (70 MiB per file, approximately 75 MiB per request). ' +
      'The novel can remain saved on this device. To publish a larger ZIP or EPUB, use Taiyou-Novels-Storage-Controller on your PC.');
  }
}

export async function uploadNovelToCloud(
  repo: string, session: CloudSession, original: File, imported: ImportedBook,
): Promise<'added' | 'duplicate'> {
  if (!ID_PATTERN.test(imported.metadata.id)) throw new Error('Invalid EPUB identifier.');
  validateCloudNovelUploadSize(imported.epub.size, original.size,
    original.name.toLowerCase().endsWith('.zip'));
  // Fetch immediately before commit so a recently uploaded novel is not lost.
  const catalog = await fetchCloudCatalog(repo, session);
  const id = imported.metadata.id;
  const epubPath = `data/novels/${id}/source.epub`;
  const archivePath = original.name.toLowerCase().endsWith('.zip') ? `data/novels/${id}/original.zip` : undefined;
  const present = catalog.books.find(book => book.id === id);
  if (present) {
    // A novel may have been published earlier as EPUB only. If its original
    // ZIP is supplied later, back it up without duplicating the novel entry.
    if (archivePath && !present.archivePath) {
      const amended: CloudCatalog = { version: 1,
        books: catalog.books.map(book => book.id === id ? { ...book, archivePath } : book),
      };
      await uploadPrivateDatasetFiles(repo, session, [
        { path: archivePath, content: original },
        { path: 'data/library.json', content: new Blob([JSON.stringify(amended, null, 2) + '\n'], { type: 'application/json' }) },
      ], `Back up novel ZIP: ${imported.metadata.title.slice(0, 80)}`);
      return 'added';
    }
    return 'duplicate';
  }
  const entry: CloudEntry = { id, metadata: cloudMetadata(imported.metadata), epubPath, ...(archivePath ? { archivePath } : {}) };
  const next: CloudCatalog = { version: 1, books: [...catalog.books, entry] };
  const files: Array<{ path: string; content: Blob }> = [
    { path: epubPath, content: imported.epub },
    { path: 'data/library.json', content: new Blob([JSON.stringify(next, null, 2) + '\n'], { type: 'application/json' }) },
  ];
  if (archivePath) files.push({ path: archivePath, content: original });
  await uploadPrivateDatasetFiles(repo, session, files, `Add novel: ${imported.metadata.title.slice(0, 80)}`);
  return 'added';
}

/**
 * Resolve a book against the PRIVATE cloud catalogue. Older browser imports may
 * have a different content hash than the hosted copy of the same title.
 * Only use a fallback when title AND author agree and the match is unique.
 */
export function findCloudEntryForBook(entries: CloudEntry[], book: Pick<LibraryBook, 'id' | 'title' | 'author'>): CloudEntry | undefined {
  const direct = entries.find(entry => validEntry(entry) && entry.id === book.id);
  if (direct) return direct;
  const normalise = (value: string): string => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const title = normalise(book.title);
  const author = normalise(book.author);
  if (!title || !author || author === 'unknown') return undefined;
  const matches = entries.filter(entry => validEntry(entry) &&
    normalise(entry.metadata.title) === title &&
    normalise(entry.metadata.author) === author);
  return matches.length === 1 ? matches[0] : undefined;
}

export function blendCloudAndLocal(remote: CloudEntry[], local: LibraryBook[]): LibraryBook[] {
  const existing = new Map(local.map(book => [book.id, book]));
  for (const entry of remote) {
    if (!validEntry(entry)) continue;
    const prior = existing.get(entry.id);
    // Local progress, favourites and summary always take precedence.
    existing.set(entry.id, { ...entry.metadata, cloud: true,
      ...(entry.coverPath ? { coverPath: entry.coverPath } : prior?.coverPath ? { coverPath: prior.coverPath } : {}),
      ...(prior ? { personalTags: prior.personalTags, userDescription: prior.userDescription,
        personalRating: prior.personalRating, personalReview: prior.personalReview,
        personalReviewUpdatedAt: prior.personalReviewUpdatedAt,
        pendingReviewSync: prior.pendingReviewSync,
        progressUpdatedAt: prior.progressUpdatedAt, pendingProgressSync: prior.pendingProgressSync,
        progress: prior.progress, currentChapter: prior.currentChapter,
        currentChapterIndex: prior.currentChapterIndex, currentChapterNumber: prior.currentChapterNumber,
        lastCfi: prior.lastCfi, lastOpenedAt: prior.lastOpenedAt } : {}),
    });
  }
  return [...existing.values()].sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
}

/**
 * The hosted catalogue is authoritative for downloadable cloud novels.
 * Keep EPUBs actually stored on this device available offline, even when
 * their old dataset was deleted or recreated.
 *
 * Stale metadata-only records remain untouched in IndexedDB for recovery;
 * they are hidden from the active library only after a successful cloud fetch.
 */
export function reconcileCloudLibrary(
  remote: CloudEntry[], local: LibraryBook[], cachedEpubIds: readonly string[],
): { books: LibraryBook[]; hiddenStaleEntries: number } {
  const merged = blendCloudAndLocal(remote, local);
  const hostedIds = new Set(remote.filter(validEntry).map(entry => entry.id));
  const cachedIds = new Set(cachedEpubIds);
  const books = merged
    .filter(book => hostedIds.has(book.id) || cachedIds.has(book.id))
    // A locally cached EPUB absent from the new dataset must be publishable
    // again; its old 'cloud: true' flag is no longer accurate. Do not write
    // this reclassification to IndexedDB until an actual upload succeeds.
    .map(book => hostedIds.has(book.id) ? book : { ...book, cloud: false });
  return { books, hiddenStaleEntries: merged.length - books.length };
}
