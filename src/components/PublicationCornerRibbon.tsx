import { normalisePublicationStatus } from '../lib/publication-status';

/** A slim diagonal mark on catalogue/search covers; status remains available
 * to assistive technology in the adjacent book metadata, not by colour alone.
 * This is publication state, never the reader's personal progress. */
export default function PublicationCornerRibbon({ status }: { status?: string }) {
  if (!status?.trim()) return null;
  const canonical = normalisePublicationStatus(status);
  const tone = canonical?.toLowerCase() || 'unknown';
  // The visible label is the novel's publication state, not reading progress.
  // Unknown legacy strings have a short, safe display without changing storage.
  return <span className={`publication-corner-ribbon publication-corner-ribbon--${tone}`}
    data-label={canonical || 'Unknown'} aria-hidden="true" />;
}
