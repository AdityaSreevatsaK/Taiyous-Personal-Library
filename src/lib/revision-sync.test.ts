import { describe, expect, it } from 'vitest';
import { decidePersonalSync, nextLocalEditTimestamp, shouldAcknowledge } from './revision-sync';
import { equivalentCollections } from './collections-sync';

const eq = (a: {progress: number}, b: {progress: number}) => a.progress === b.progress;

describe('clock-independent conflict resolution for legacy and new devices', () => {
  it('does not allow a five-minutes-fast device to hide a later offline edit', () => {
    const fastClock = 1_000_000 + 5 * 60_000;
    const slowClock = 1_000_000 - 5 * 60_000;
    const oldCloud = { progress: 20, updatedAt: fastClock };
    const localLater = { progress: 30, updatedAt: slowClock };
    expect(decidePersonalSync(localLater, oldCloud, true, 'a'.repeat(64), 'b'.repeat(64), true, eq))
      .toBe('conflict');
    expect(decidePersonalSync(localLater, oldCloud, true, undefined, 'b'.repeat(64), true, eq))
      .toBe('conflict');
    expect(decidePersonalSync(localLater, oldCloud, true, 'b'.repeat(64), 'b'.repeat(64), true, eq))
      .toBe('upload');
  });

  it('migrates v1 records without discarding distinct positions, notes or reviews', () => {
    const newer = { progress: 40 }, older = { progress: 3 };
    expect(decidePersonalSync(newer, older, false, undefined, 'a'.repeat(64), true, eq)).toBe('conflict');
    expect(decidePersonalSync(older, newer, false, undefined, 'a'.repeat(64), false, eq)).toBe('adopt');
    expect(decidePersonalSync(newer, null, false, undefined, null, true, eq)).toBe('upload');
    expect(decidePersonalSync(newer, newer, true, undefined, 'a'.repeat(64), true, eq)).toBe('adopt');
  });

  it('retains local edits when a cloud record unexpectedly disappears', () => {
    expect(decidePersonalSync({ progress: 45 }, null, false, 'a'.repeat(64), null, true, eq))
      .toBe('conflict');
  });

  it('does not confuse a locally backward clock jump with a new cloud revision', () => {
    expect(nextLocalEditTimestamp(10, 500)).toBe(501);
    expect(shouldAcknowledge(501, 500)).toBe(false);
    expect(shouldAcknowledge(501, 501)).toBe(true);
  });

  it('recognises collection membership divergence regardless of timestamp skew', () => {
    const base = [{ id: 'collection_one', name: 'Series', bookIds: ['a'.repeat(24)], updatedAt: 100 }];
    const remote = [{ ...base[0], bookIds: ['b'.repeat(24)], updatedAt: 1_000_000 }];
    expect(equivalentCollections(base, remote)).toBe(false);
    expect(decidePersonalSync(base, remote, true, 'a'.repeat(64), 'b'.repeat(64), true,
      equivalentCollections)).toBe('conflict');
  });
});
