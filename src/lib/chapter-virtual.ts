/** A complete, virtualised list of any length, rendering at most pageSize rows. */
export function virtualChapterWindow(length: number, first: number, pageSize = 40) {
  const total = Math.max(0, Math.floor(length));
  const from = Math.max(0, Math.min(Math.floor(first), Math.max(0, total - pageSize)));
  return { from, to: Math.min(total, from + pageSize) };
}
