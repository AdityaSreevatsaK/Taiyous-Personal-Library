import { normalisePublicationStatus } from '../lib/publication-status';

/** A slim diagonal mark on catalogue/search covers; status remains available
 * to assistive technology in the adjacent book metadata, not by colour alone.
 * This is publication state, never the reader's personal progress. */
export default function PublicationCornerRibbon({ status }: { status?: string }) {
  if (!status?.trim()) return null;
  const tone = normalisePublicationStatus(status)?.toLowerCase() || 'unknown';
  return <span className={`publication-corner-ribbon publication-corner-ribbon--${tone}`}
    aria-hidden="true" />;
}
