/**
 * Cross-device reconciliation uses observed cloud content revisions, never
 * wall-clock timestamps. An undefined base is an unmigrated v1 browser record;
 * null is a known absent cloud record.
 */
export type SyncDecision = 'upload' | 'adopt' | 'unchanged' | 'conflict';

export function decidePersonalSync<T>(
  local: T,
  remote: T | null,
  pending: boolean,
  lastSeenRevision: string | null | undefined,
  remoteRevision: string | null,
  meaningfulLocal: boolean,
  equivalent: (a: T, b: T) => boolean,
): SyncDecision {
  if (remote !== null && equivalent(local, remote)) return 'adopt';
  if (pending) {
    if (lastSeenRevision === undefined && remote !== null) return 'conflict';
    return lastSeenRevision !== undefined && lastSeenRevision !== remoteRevision ? 'conflict' : 'upload';
  }
  if (lastSeenRevision === undefined) {
    if (remote === null) return meaningfulLocal ? 'upload' : 'adopt';
    return meaningfulLocal ? 'conflict' : 'adopt';
  }
  // Remote deletion is not automatically authoritative over meaningful local data.
  if (remote === null && lastSeenRevision !== null && meaningfulLocal) return 'conflict';
  return lastSeenRevision === remoteRevision ? 'unchanged' : 'adopt';
}

/** Reject a stale in-flight save acknowledgement after more local editing. */
export function shouldAcknowledge(currentTimestamp: number | undefined, sentTimestamp: number | undefined): boolean {
  return currentTimestamp === sentTimestamp;
}

/** Only orders successive edits made on THIS browser, not cross-device edits. */
export function nextLocalEditTimestamp(now: number, previous?: number): number {
  return Math.max(now, (previous ?? 0) + 1);
}
