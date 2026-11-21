import { describe, expect, it } from 'vitest';
import { decidePersonalSync, nextLocalEditTimestamp, shouldAcknowledge } from './revision-sync';

const equivalent = (a: { progress: number }, b: { progress: number }) => a.progress === b.progress;

describe('revision-safe personal sync decisions (Issue #34)', () => {
  it('does not compare clocks from different devices to decide whether to overwrite progress', () => {
    const local = { progress: 65, updatedAt: 100 };
    const remote = { progress: 25, updatedAt: 1_000_000 };
    expect(decidePersonalSync(local, remote, true, 'a'.repeat(64), 'b'.repeat(64), true, equivalent))
      .toBe('conflict');
    expect(decidePersonalSync(local, remote, true, 'b'.repeat(64), 'b'.repeat(64), true, equivalent))
      .toBe('upload');
  });
  it('does not silently discard a meaningful unversioned v1 reading position', () => {
    const local = { progress: 50 }, remote = { progress: 80 };
    expect(decidePersonalSync(local, remote, false, undefined, 'c'.repeat(64), true, equivalent))
      .toBe('conflict');
    expect(decidePersonalSync(local, null, false, undefined, null, true, equivalent))
      .toBe('upload');
    expect(decidePersonalSync({ progress: 0 }, remote, false, undefined, 'c'.repeat(64), false, equivalent))
      .toBe('adopt');
  });
  it('treats disappeared cloud state as a conflict rather than erasing meaningful local data', () => {
    expect(decidePersonalSync({ progress: 45 }, null, false, 'a'.repeat(64), null, true, equivalent))
      .toBe('conflict');
  });
  it('rejects stale acknowledgements from an in-flight write', () => {
    expect(nextLocalEditTimestamp(10, 500)).toBe(501);
    expect(shouldAcknowledge(501, 500)).toBe(false);
    expect(shouldAcknowledge(501, 501)).toBe(true);
  });
  it('recognises equivalent content without a destructive overwrite', () => {
    expect(decidePersonalSync({ progress: 50 }, { progress: 50 }, true,
      undefined, 'a'.repeat(64), true, equivalent)).toBe('adopt');
  });
});
