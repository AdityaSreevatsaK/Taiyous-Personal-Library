import { uploadFiles } from '@huggingface/hub';
import type { CloudSession } from './cloud';
import { assertPrivateDataset, validateDatasetRepo } from './cloud';

export interface BookCollection {
  id: string;
  name: string;
  bookIds: string[];
  updatedAt: number;
  /** A tombstone prevents deleted collections from being restored by another device. */
  deleted?: boolean;
}

export interface CollectionDocument {
  version: 1;
  collections: BookCollection[];
}

const STORAGE_KEY = 'taiyou.personal-collections.v1';
const PENDING_KEY = 'taiyou.personal-collections-pending.v1';
export function readCollectionsPending(): boolean {
  try { return localStorage.getItem(PENDING_KEY) === 'yes'; } catch { return false; }
}
export function writeCollectionsPending(value: boolean): void {
  try { if (value) localStorage.setItem(PENDING_KEY, 'yes'); else localStorage.removeItem(PENDING_KEY); }
  catch { /* Browser storage unavailable; collection data is still held in React state. */ }
}

const CLOUD_PATH = 'data/personal/collections.json';
const validId = /^[a-zA-Z0-9_-]{8,100}$/;

export function validateCollections(value: unknown): BookCollection[] {
  if (!value || typeof value !== 'object') throw new Error('Invalid collections file.');
  const doc = value as Partial<CollectionDocument>;
  if (doc.version !== 1 || !Array.isArray(doc.collections) || doc.collections.length > 500) {
    throw new Error('Unsupported collections file.');
  }
  const seen = new Set<string>();
  return doc.collections.map((raw) => {
    if (!raw || typeof raw !== 'object' || !validId.test(raw.id) ||
      typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 90 ||
      !Array.isArray(raw.bookIds) || raw.bookIds.length > 2000 ||
      raw.bookIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) ||
      typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0 ||
      (raw.deleted !== undefined && typeof raw.deleted !== 'boolean') || seen.has(raw.id)) {
      throw new Error('Invalid collection entry.');
    }
    seen.add(raw.id);
    return { id: raw.id, name: raw.name.trim(), bookIds: [...new Set(raw.bookIds)],
      updatedAt: raw.updatedAt, ...(raw.deleted ? { deleted: true } : {}) };
  });
}

export function mergeCollections(a: BookCollection[], b: BookCollection[]): BookCollection[] {
  const entries = new Map<string, BookCollection>();
  for (const entry of [...a, ...b]) {
    const previous = entries.get(entry.id);
    if (!previous || entry.updatedAt > previous.updatedAt || (entry.updatedAt === previous.updatedAt && entry.deleted)) {
      entries.set(entry.id, entry);
    }
  }
  return [...entries.values()].sort((x, y) => x.name.localeCompare(y.name));
}

export function readLocalCollections(): BookCollection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? validateCollections(JSON.parse(raw)) : [];
  } catch { return []; }
}

export function writeLocalCollections(items: BookCollection[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, collections: items }));
}

export async function fetchCloudCollections(repo: string, session: CloudSession): Promise<BookCollection[]> {
  const id = validateDatasetRepo(repo);
  const response = await fetch(`https://huggingface.co/datasets/${id}/resolve/main/${CLOUD_PATH}?v=${Date.now()}`, {
    headers: { Authorization: `Bearer ${session.accessToken}` }, cache: 'no-store',
  });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Unable to fetch private collections (${response.status}).`);
  return validateCollections(await response.json());
}

/** Fetch before writing and merge by per-collection timestamps to avoid stale overwrites. */
export async function saveCloudCollections(
  repo: string, session: CloudSession, updates: BookCollection[],
): Promise<BookCollection[]> {
  await assertPrivateDataset(repo, session);
  const current = await fetchCloudCollections(repo, session);
  const merged = mergeCollections(current, updates);
  await uploadFiles({
    repo: { type: 'dataset', name: validateDatasetRepo(repo) },
    accessToken: session.accessToken,
    files: [{ path: CLOUD_PATH, content: new Blob([JSON.stringify({ version: 1, collections: merged }, null, 2)], { type: 'application/json' }) }],
    commitTitle: 'Update private reading collections',
  });
  return merged;
}
