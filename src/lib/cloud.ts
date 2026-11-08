import { uploadFiles } from '@huggingface/hub';
import type { LibraryBook, ImportedBook } from '../types';

/**
 * Shared library lives in a PRIVATE Hugging Face Dataset. A private Static Space
 * cannot be opened directly by a public .hf.space URL, so OAuth redirects are
 * unreliable here. Connect using a DATASET-SCOPED token supplied by the owner.
 * Credentials live ONLY in React memory, never in repo files, sessionStorage,
 * localStorage, a build variable, or query parameters. Refreshing disconnects.
 */
export interface CloudSession {
  accessToken: string;
  expiresAt: number;
  username: string;
}

export interface CloudEntry {
  id: string;
  metadata: LibraryBook;
  epubPath: string;
  archivePath?: string;
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

function resolveUrl(repo: string, path: string): string {
  const repoId = validateDatasetRepo(repo);
  if (!/^data\/[\w/-]+\.(epub|zip|json)$/.test(path) || path.includes('..')) throw new Error('Invalid library file path.');
  return `https://huggingface.co/datasets/${repoId}/resolve/main/${path.split('/').map(encodeURIComponent).join('/')}?v=${Date.now()}`;
}

/** Refuse to upload book content to an accidentally public dataset. */
export async function assertPrivateDataset(repo: string, session: CloudSession): Promise<void> {
  const repoId = validateDatasetRepo(repo);
  if (session.expiresAt <= Date.now() + 30_000) throw new Error('Hugging Face authorisation expired. Sign in again.');
  const result = await fetch(`https://huggingface.co/api/datasets/${repoId}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store',
  });
  if (!result.ok) throw new Error(`Cannot access the private dataset ${repoId} (${result.status}). Create it and grant your account access.`);
  const info = await result.json() as { private?: boolean };
  if (info.private !== true) throw new Error(`Dataset ${repoId} is NOT PRIVATE. Change its visibility to Private before importing novels.`);
}

async function privateGet(repo: string, path: string, session: CloudSession): Promise<Response> {
  if (session.expiresAt <= Date.now() + 30_000) throw new Error('Hugging Face authorisation expired. Sign in again.');
  const response = await fetch(resolveUrl(repo, path), {
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
    && (!value.archivePath || value.archivePath === `data/novels/${value.id}/original.zip`);
}

export async function fetchCloudCatalog(repo: string, session: CloudSession): Promise<CloudCatalog> {
  await assertPrivateDataset(repo, session);
  const response = await privateGet(repo, 'data/library.json', session);
  if (response.status === 404) return emptyCatalog();
  if (!response.ok) throw new Error(`Could not retrieve cloud catalogue (${response.status}). Create a PRIVATE dataset at ${repo}.`);
  const result = await response.json() as CloudCatalog;
  if (result.version !== 1 || !Array.isArray(result.books) || result.books.some((e) => !validEntry(e))) {
    throw new Error('The remote data/library.json catalogue is invalid or uses an unsupported format.');
  }
  return result;
}

export async function fetchCloudEpub(repo: string, entry: CloudEntry, session: CloudSession): Promise<Blob> {
  if (!validEntry(entry)) throw new Error('Invalid cloud novel entry.');
  const response = await privateGet(repo, entry.epubPath, session);
  if (!response.ok) throw new Error(`Unable to download ${entry.metadata.title} (${response.status}).`);
  const blob = await response.blob();
  if (!blob.size || blob.size > 120 * 1024 * 1024) throw new Error('The hosted EPUB is empty or too large.');
  return blob;
}

function cloudMetadata(book: LibraryBook): LibraryBook {
  // Personal tags, reading position and per-device timestamps are NOT published.
  return {
    id: book.id, title: book.title, author: book.author, language: book.language,
    chapterCount: book.chapterCount, description: book.description,
    sourceTags: book.sourceTags, sourceUrl: book.sourceUrl,
    status: book.status, metadataScanned: book.metadataScanned,
    originalFileName: book.originalFileName, importedAt: book.importedAt,
    size: book.size, personalTags: [], progress: 0, cloud: true,
  };
}

export async function uploadNovelToCloud(
  repo: string, session: CloudSession, original: File, imported: ImportedBook,
): Promise<'added' | 'duplicate'> {
  if (!ID_PATTERN.test(imported.metadata.id)) throw new Error('Invalid EPUB identifier.');
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
      await uploadFiles({
        repo: { type: 'dataset', name: validateDatasetRepo(repo) },
        accessToken: session.accessToken,
        files: [
          { path: archivePath, content: original },
          { path: 'data/library.json', content: new Blob([JSON.stringify(amended, null, 2) + '\n'], { type: 'application/json' }) },
        ],
        commitTitle: `Back up novel ZIP: ${imported.metadata.title.slice(0, 80)}`,
      });
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
  await uploadFiles({
    repo: { type: 'dataset', name: validateDatasetRepo(repo) },
    accessToken: session.accessToken,
    files,
    commitTitle: `Add novel: ${imported.metadata.title.slice(0, 80)}`,
  });
  return 'added';
}

export function blendCloudAndLocal(remote: CloudEntry[], local: LibraryBook[]): LibraryBook[] {
  const existing = new Map(local.map(book => [book.id, book]));
  for (const entry of remote) {
    if (!validEntry(entry)) continue;
    const prior = existing.get(entry.id);
    // Local progress, favourites and summary always take precedence.
    existing.set(entry.id, { ...entry.metadata, cloud: true,
      ...(prior ? { personalTags: prior.personalTags, userDescription: prior.userDescription,
        progress: prior.progress, currentChapter: prior.currentChapter,
        currentChapterIndex: prior.currentChapterIndex, currentChapterNumber: prior.currentChapterNumber,
        lastCfi: prior.lastCfi, lastOpenedAt: prior.lastOpenedAt } : {}),
    });
  }
  return [...existing.values()].sort((a, b) => (b.lastOpenedAt ?? b.importedAt) - (a.lastOpenedAt ?? a.importedAt));
}
