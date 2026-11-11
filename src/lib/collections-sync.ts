import { CloudPersonalConflict, type CloudSession } from './cloud';
import {
  fetchVersionedCollections, writeVersionedCollections,
  type BookCollection, type CollectionsSyncConflict,
} from './collections';
import { decidePersonalSync } from './revision-sync';

export interface CollectionsOutcome {
  collections: BookCollection[];
  baseRevision: string | null;
  pending: boolean;
  conflict: CollectionsSyncConflict | null;
}

export function equivalentCollections(local: BookCollection[], remote: BookCollection[]): boolean {
  const shape = (records: BookCollection[]) =>
    records.map(c => ({ id: c.id, name: c.name, deleted: !!c.deleted,
      bookIds: [...c.bookIds].sort() })).sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(shape(local)) === JSON.stringify(shape(remote));
}

export async function reconcileCollections(
  repo: string, session: CloudSession, local: BookCollection[],
  pending: boolean, baseRevision: string | null | undefined, unresolved: CollectionsSyncConflict | null,
): Promise<CollectionsOutcome> {
  if (session.via !== 'oauth') throw new Error('Sign in with Hugging Face to safely sync collections.');
  const remote = await fetchVersionedCollections(repo, session);
  const hosted = remote.value ?? [];
  if (unresolved) {
    return { collections: local, baseRevision: baseRevision ?? null, pending: true,
      conflict: { remote: hosted, revision: remote.revision } };
  }
  const decision = decidePersonalSync(local, hosted, pending, baseRevision,
    remote.revision, local.length > 0, equivalentCollections);
  if (decision === 'conflict') return {
    collections: local, baseRevision: baseRevision ?? null, pending: true,
    conflict: { remote: hosted, revision: remote.revision },
  };
  if (decision === 'adopt') return {
    collections: hosted, baseRevision: remote.revision, pending: false, conflict: null,
  };
  if (decision === 'unchanged') return {
    collections: local, baseRevision: remote.revision, pending: false, conflict: null,
  };
  try {
    const result = await writeVersionedCollections(repo, session, local, remote.revision);
    return { collections: local, baseRevision: result.revision, pending: false, conflict: null };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) return {
      collections: local, baseRevision: baseRevision ?? null, pending: true,
      conflict: { remote: (error.snapshot.value as BookCollection[] | null) ?? [],
        revision: error.snapshot.revision },
    };
    throw error;
  }
}

export async function resolveCollections(
  repo: string, session: CloudSession, local: BookCollection[],
  choice: 'cloud' | 'device',
): Promise<CollectionsOutcome> {
  const remote = await fetchVersionedCollections(repo, session);
  if (choice === 'cloud') return {
    collections: remote.value ?? [], baseRevision: remote.revision, pending: false, conflict: null,
  };
  try {
    const result = await writeVersionedCollections(repo, session, local, remote.revision);
    return { collections: local, baseRevision: result.revision, pending: false, conflict: null };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) return {
      collections: local, baseRevision: remote.revision, pending: true,
      conflict: { remote: (error.snapshot.value as BookCollection[] | null) ?? [],
        revision: error.snapshot.revision },
    };
    throw error;
  }
}
