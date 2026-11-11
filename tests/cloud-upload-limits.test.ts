import { describe, expect, it } from 'vitest';
import { validateCloudNovelUploadSize } from '../src/lib/cloud';
const MiB = 1024 * 1024;
describe('web upload capability contract', () => {
  it('permits novels within both Cloudflare size limits', () => {
    expect(() => validateCloudNovelUploadSize(69 * MiB, 0, false)).not.toThrow();
    expect(() => validateCloudNovelUploadSize(30 * MiB, 40 * MiB, true)).not.toThrow();
    expect(() => validateCloudNovelUploadSize(70 * MiB, 0, false)).not.toThrow();
  });
  it('rejects per-file and total request limits with actionable instructions', () => {
    for (const [epub, zip, includesZip] of [
      [71, 0, false], [50, 25, true], [12, 71, true], [120, 0, false],
    ] as const) {
      expect(() => validateCloudNovelUploadSize(epub * MiB, zip * MiB, includesZip))
        .toThrow(/Storage-Controller/);
    }
  });
  it('does not double-count a standalone EPUB as an original ZIP', () => {
    expect(() => validateCloudNovelUploadSize(60 * MiB, 60 * MiB, false)).not.toThrow();
  });
});
