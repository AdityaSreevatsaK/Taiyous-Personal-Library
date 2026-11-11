import type { CloudPersonalReview, CloudReadingProgress, CloudRevisionSnapshot } from './lib/cloud';

export type ReaderTheme = 'light' | 'dark' | 'sepia';
export type FontChoice = 'literary' | 'classic' | 'georgia' | 'sans' | 'clear';

export interface ReaderSettings {
  theme: ReaderTheme;
  font: FontChoice;
  fontSize: number;
  lineHeight: number;
  readingWidth: number;
}

export interface LibraryBook {
  id: string;
  /** True if this novel also exists in the private Hugging Face data repository. */
  cloud?: boolean;
  title: string;
  author: string;
  language?: string;
  chapterCount?: number;
  /** Automatically extracted genres and subjects from the ZIP/EPUB. */
  sourceTags?: string[];
  /** User-created tags stored only in IndexedDB. */
  personalTags?: string[];
  description?: string;
  /** Optional user-supplied replacement summary. */
  userDescription?: string;
  /** Personal rating from 1 to 10; synchronised with private dataset when connected. */
  personalRating?: number;
  /** Temporary reading trial; separate from tags, collections, and reading progress. */
  shelfStatus?: 'trying';
  /** Private comments, stored in a separate private notes file when connected. */
  personalReview?: string;
  /** Latest rating/comments edit timestamp to merge cloud notes safely. */
  personalReviewUpdatedAt?: number;
  /** Saved locally and awaiting publication to the private dataset. */
  pendingReviewSync?: boolean;
  /** Last cloud content revision observed by this device; undefined = legacy unmigrated. */
  reviewCloudRevision?: string | null;
  /** Remote value retained for deliberate resolution; never automatically discard local edits. */
  reviewSyncConflict?: CloudRevisionSnapshot<CloudPersonalReview>;
  status?: string;
  sourceUrl?: string;
  /** Optional private dataset artwork, e.g. data/novels/<book-id>/cover.jpg. */
  coverPath?: string;
  /** Old imports are enriched lazily when their detail pages are opened. */
  metadataScanned?: boolean;
  currentChapterNumber?: number;
  originalFileName: string;
  importedAt: number;
  lastOpenedAt?: number;
  lastCfi?: string;
  progress: number;
  currentChapter?: string;
  currentChapterIndex?: number;
  /** Newest local progress edit; used to resolve cross-device updates. */
  progressUpdatedAt?: number;
  /** Progress waiting to be written to the private cloud after reconnect. */
  pendingProgressSync?: boolean;
  progressCloudRevision?: string | null;
  progressSyncConflict?: CloudRevisionSnapshot<CloudReadingProgress>;
  size: number;
}

export interface ImportedBook {
  metadata: LibraryBook;
  epub: Blob;
}

export interface ChapterItem {
  label: string;
  href: string;
  level: number;
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  font: 'literary',
  fontSize: 115,
  lineHeight: 1.65,
  // 0 means full available width, with small responsive side gutters.
  readingWidth: 0,
};
