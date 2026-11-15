import type { LibraryBook } from '../types';

/** Only records missing from the fresh authoritative private catalogue AND
 * missing a locally stored EPUB are candidates for archival. Never change
 * their immutable IDs, ratings, annotations, or progress when archiving.
 */
export function staleMetadataCandidates(
  local: readonly LibraryBook[],
  hostedIds: readonly string[],
  cachedEpubIds: readonly string[],
): LibraryBook[] {
  const hosted = new Set(hostedIds);
  const files = new Set(cachedEpubIds);
  return local.filter(book => !hosted.has(book.id) && !files.has(book.id));
}
