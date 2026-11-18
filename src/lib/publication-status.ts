/** Publication status comes from source metadata, never reading progress. */
export type PublicationStatus = 'Completed' | 'Ongoing' | 'Hiatus' | 'Dropped';
export type PublicationStatusFilter = PublicationStatus | 'Unknown';

const ALIASES: Record<string, PublicationStatus> = {
  completed: 'Completed', complete: 'Completed', finished: 'Completed',
  ongoing: 'Ongoing', 'on going': 'Ongoing', updating: 'Ongoing',
  publishing: 'Ongoing', serializing: 'Ongoing', serialising: 'Ongoing',
  'in progress': 'Ongoing',
  hiatus: 'Hiatus', 'on hiatus': 'Hiatus', 'on hold': 'Hiatus',
  paused: 'Hiatus',
  dropped: 'Dropped', discontinued: 'Dropped', abandoned: 'Dropped',
  cancelled: 'Dropped', canceled: 'Dropped',
};

/** Accept legacy spellings without changing catalogue content in storage. */
export function normalisePublicationStatus(value: unknown): PublicationStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const label = value.normalize('NFKC').trim().toLowerCase()
    .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return ALIASES[label];
}

export function publicationStatusDisplay(value: string | undefined): string {
  return normalisePublicationStatus(value) || value?.trim() || 'Unknown';
}

export function publicationStatusTone(value: string | undefined): string {
  return 'publication-status--' + (normalisePublicationStatus(value) || 'Unknown').toLowerCase();
}

/** Stable grouping when sorting; title is the caller's tie-breaker. */
export function publicationStatusRank(value: string | undefined): number {
  const status = normalisePublicationStatus(value);
  return status === 'Completed' ? 0 : status === 'Ongoing' ? 1 :
    status === 'Hiatus' ? 2 : status === 'Dropped' ? 3 : 4;
}
