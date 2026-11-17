import type { CloudSession } from './cloud';
import { assertPrivateDataset, uploadPrivateDatasetFiles, validateDatasetRepo } from './cloud';

export interface BookCollection {
  id: string;
  name: string;
  bookIds: string[];
  /** Optional parent collection. Omitted for top-level collections (v1-compatible). */
  parentId?: string;
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
  const validated = doc.collections.map((raw) => {
    if (!raw || typeof raw !== 'object' || !validId.test(raw.id) ||
      typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 90 ||
      !Array.isArray(raw.bookIds) || raw.bookIds.length > 2000 ||
      raw.bookIds.some(id => typeof id !== 'string' || !/^[0-9a-f]{24}$/.test(id)) ||
      typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt) || raw.updatedAt < 0 ||
      (raw.deleted !== undefined && typeof raw.deleted !== 'boolean') ||
      (raw.parentId !== undefined && (typeof raw.parentId !== 'string' || !validId.test(raw.parentId) || raw.parentId === raw.id)) ||
      seen.has(raw.id)) {
      throw new Error('Invalid collection entry.');
    }
    seen.add(raw.id);
    return { id: raw.id, name: raw.name.trim(), bookIds: [...new Set(raw.bookIds)],
      updatedAt: raw.updatedAt, ...(raw.parentId ? { parentId: raw.parentId } : {}),
      ...(raw.deleted ? { deleted: true } : {}) };
  });
  // A malformed remote hierarchy must not trap the UI in recursive rendering.
  // Dangling parents are kept as metadata and displayed at the root instead.
  const byId = new Map(validated.filter(c => !c.deleted).map(c => [c.id, c]));
  for (const entry of byId.values()) {
    const visited = new Set<string>([entry.id]);
    let parentId = entry.parentId;
    while (parentId && byId.has(parentId)) {
      if (visited.has(parentId)) throw new Error('Collection hierarchy contains a cycle.');
      visited.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  return validated;
}

export function mergeCollections(a: BookCollection[], b: BookCollection[]): BookCollection[] {
  const entries = new Map<string, BookCollection>();
  for (const entry of [...a, ...b]) {
    const previous = entries.get(entry.id);
    if (!previous || entry.updatedAt > previous.updatedAt || (entry.updatedAt === previous.updatedAt && entry.deleted)) {
      entries.set(entry.id, entry);
    }
  }
  // Concurrent offline moves can independently create A -> B and B -> A.
  // Refuse to upload that combined cycle; preserve both local/remote copies
  // for retry instead of silently writing a corrupt collection hierarchy.
  return validateCollections({
    version: 1,
    collections: [...entries.values()].sort((x,y) => x.name.localeCompare(y.name)),
  });
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
  const response = session.via === 'oauth'
    ? await fetch('/api/library?action=file&path=' + encodeURIComponent(CLOUD_PATH),
        { credentials: 'same-origin', cache: 'no-store' })
    : await fetch(`https://huggingface.co/datasets/${id}/resolve/main/${CLOUD_PATH}?v=${Date.now()}`, {
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
  await uploadPrivateDatasetFiles(repo, session, [
    { path: CLOUD_PATH, content: new Blob([JSON.stringify({ version: 1, collections: merged }, null, 2)], { type: 'application/json' }) },
  ], 'Update private reading collections');
  return merged;
}

/** Parents are optional to retain full compatibility with existing v1 data. */
export function collectionChildren(items: BookCollection[], parentId: string | null = null): BookCollection[] {
  const active = items.filter(item => !item.deleted);
  const existing = new Set(active.map(item => item.id));
  return active.filter(item => parentId
    ? item.parentId === parentId
    : !item.parentId || !existing.has(item.parentId))
    .sort((a,b) => a.name.localeCompare(b.name, undefined, {sensitivity:'base', numeric:true}));
}

export function collectionAncestors(items: BookCollection[], id: string): BookCollection[] {
  const byId = new Map(items.filter(item => !item.deleted).map(item => [item.id, item]));
  const path: BookCollection[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    path.unshift(current);
    visited.add(current.id);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export function collectionTree(items: BookCollection[]): Array<{collection:BookCollection; depth:number; path:string}> {
  const flattened: Array<{collection:BookCollection; depth:number; path:string}> = [];
  const seen = new Set<string>();
  const walk = (node: BookCollection, depth: number, path: string) => {
    if (seen.has(node.id)) return;
    seen.add(node.id);
    const currentPath = path ? path + ' / ' + node.name : node.name;
    flattened.push({collection:node, depth, path:currentPath});
    for (const child of collectionChildren(items,node.id)) walk(child, depth+1, currentPath);
  };
  for (const node of collectionChildren(items)) walk(node,0,'');
  // Fail-safe for pre-existing bad sync data: render nodes rather than hiding them.
  for (const node of items.filter(item => !item.deleted)) if (!seen.has(node.id)) walk(node,0,'');
  return flattened;
}

export function collectionDescendantIds(items: BookCollection[], id: string): Set<string> {
  const found = new Set<string>();
  const queue = [id];
  for (let index = 0; index < queue.length; index++) {
    for (const child of collectionChildren(items, queue[index])) {
      if (found.has(child.id)) continue;
      found.add(child.id);
      queue.push(child.id);
    }
  }
  return found;
}

export function moveCollection(
  items: BookCollection[], id: string, parentId: string | null, timestamp = Date.now(),
): BookCollection[] {
  const item = items.find(entry => entry.id === id && !entry.deleted);
  if (!item) throw new Error('Collection no longer exists.');
  const nextParent = parentId || undefined;
  if (nextParent === item.parentId) return items;
  if (nextParent) {
    if (!items.some(entry => entry.id === nextParent && !entry.deleted)) throw new Error('Parent collection no longer exists.');
    if (nextParent === id || collectionDescendantIds(items,id).has(nextParent))
      throw new Error('A collection cannot be moved into itself or one of its subcollections.');
  }
  return items.map(entry => entry.id === id
    ? { ...entry, parentId:nextParent, updatedAt:Math.max(timestamp,entry.updatedAt+1) }
    : entry);
}

/** Deleting a folder retains its novels and adopts children into its own parent. */
export function deleteCollectionPreservingChildren(
  items: BookCollection[], id: string, timestamp = Date.now(),
): BookCollection[] {
  const target = items.find(entry => entry.id === id && !entry.deleted);
  if (!target) return items;
  const parentId = items.some(entry => entry.id === target.parentId && !entry.deleted)
    ? target.parentId : undefined;
  return items.map(entry => {
    if (entry.id === id) return { ...entry, deleted:true, updatedAt:Math.max(timestamp,entry.updatedAt+1) };
    if (!entry.deleted && entry.parentId === id)
      return { ...entry, parentId, updatedAt:Math.max(timestamp,entry.updatedAt+1) };
    return entry;
  });
}
