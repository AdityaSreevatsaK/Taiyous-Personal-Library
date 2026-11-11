import type { LibraryBook } from '../types';
import {
  CloudPersonalConflict,
  fetchVersionedPersonalReview, fetchVersionedReadingProgress,
  writeVersionedPersonalReview, writeVersionedReadingProgress,
  type CloudPersonalReview, type CloudReadingProgress, type CloudRevisionSnapshot, type CloudSession,
} from './cloud';
import { decidePersonalSync } from './revision-sync';

function hasLocalReading(book: LibraryBook): boolean {
  return book.progress > 0 || !!book.lastCfi || !!book.currentChapter ||
    book.currentChapterIndex !== undefined || book.currentChapterNumber !== undefined;
}
function sameReading(book: LibraryBook, remote: CloudReadingProgress): boolean {
  return book.progress === remote.progress &&
    (book.lastCfi ?? null) === remote.lastCfi &&
    (book.currentChapter ?? null) === remote.currentChapter &&
    (book.currentChapterIndex ?? null) === remote.currentChapterIndex &&
    (book.currentChapterNumber ?? null) === remote.currentChapterNumber;
}
function hasLocalReview(book: LibraryBook): boolean {
  return book.personalRating !== undefined || !!book.personalReview || book.shelfStatus === 'trying';
}
function sameReview(book: LibraryBook, remote: CloudPersonalReview): boolean {
  return (book.personalRating ?? null) === remote.rating &&
    (book.personalReview ?? '') === remote.comments &&
    (book.shelfStatus ?? null) === (remote.shelfStatus ?? null);
}

function takeRemoteReading(book: LibraryBook, remote: CloudRevisionSnapshot<CloudReadingProgress>): LibraryBook {
  // A legacy local import can match a hosted novel by unique title + author
  // while retaining a different local EPUB ID. The server has already
  // validated the hosted bookId against the requested path, so copy the
  // position without replacing the browser's local IndexedDB identity.
  const position = remote.value;
  return { ...book, progress: position?.progress ?? 0,
    currentChapter: position?.currentChapter ?? undefined,
    currentChapterIndex: position?.currentChapterIndex ?? undefined,
    currentChapterNumber: position?.currentChapterNumber ?? undefined,
    lastCfi: position?.lastCfi ?? undefined,
    lastOpenedAt: position?.lastOpenedAt ?? undefined,
    progressUpdatedAt: position?.updatedAt,
    progressCloudRevision: remote.revision,
    pendingProgressSync: false, progressSyncConflict: undefined };
}
function takeRemoteReview(book: LibraryBook, remote: CloudRevisionSnapshot<CloudPersonalReview>): LibraryBook {
  const note = remote.value;
  return { ...book,
    personalRating: note?.rating ?? undefined,
    personalReview: note?.comments ?? undefined,
    shelfStatus: note?.shelfStatus === 'trying' ? 'trying' : undefined,
    personalReviewUpdatedAt: note?.updatedAt,
    reviewCloudRevision: remote.revision, pendingReviewSync: false, reviewSyncConflict: undefined };
}

/** Never resolve a concurrent edit based on device timestamps. */
export async function syncReadingRecord(
  repo: string, session: CloudSession, id: string, book: LibraryBook,
): Promise<LibraryBook> {
  if (session.via !== 'oauth') throw new Error('Sign in with Hugging Face to safely sync reading progress.');
  const remote = await fetchVersionedReadingProgress(repo, id, session);
  if (book.progressSyncConflict) {
    return { ...book, pendingProgressSync: true, progressSyncConflict: remote };
  }
  const decision = decidePersonalSync(book, remote.value, !!book.pendingProgressSync,
    book.progressCloudRevision, remote.revision, hasLocalReading(book),
    (local, hosted) => sameReading(local, hosted));
  if (decision === 'unchanged') return book;
  if (decision === 'adopt') return takeRemoteReading(book, remote);
  if (decision === 'conflict') {
    return { ...book, pendingProgressSync: true, progressSyncConflict: remote };
  }
  try {
    const saved = await writeVersionedReadingProgress(repo, id, session, book, remote.revision);
    return { ...book, progressCloudRevision: saved.revision,
      pendingProgressSync: false, progressSyncConflict: undefined };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) {
      return { ...book, pendingProgressSync: true,
        progressSyncConflict: error.snapshot as CloudRevisionSnapshot<CloudReadingProgress> };
    }
    throw error;
  }
}

export async function syncReviewRecord(
  repo: string, session: CloudSession, id: string, book: LibraryBook,
): Promise<LibraryBook> {
  if (session.via !== 'oauth') throw new Error('Sign in with Hugging Face to safely sync private notes.');
  const remote = await fetchVersionedPersonalReview(repo, id, session);
  if (book.reviewSyncConflict) {
    return { ...book, pendingReviewSync: true, reviewSyncConflict: remote };
  }
  const decision = decidePersonalSync(book, remote.value, !!book.pendingReviewSync,
    book.reviewCloudRevision, remote.revision, hasLocalReview(book),
    (local, hosted) => sameReview(local, hosted));
  if (decision === 'unchanged') return book;
  if (decision === 'adopt') return takeRemoteReview(book, remote);
  if (decision === 'conflict') {
    return { ...book, pendingReviewSync: true, reviewSyncConflict: remote };
  }
  try {
    const saved = await writeVersionedPersonalReview(repo, id, session, book, remote.revision);
    return { ...book, reviewCloudRevision: saved.revision,
      pendingReviewSync: false, reviewSyncConflict: undefined };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) {
      return { ...book, pendingReviewSync: true,
        reviewSyncConflict: error.snapshot as CloudRevisionSnapshot<CloudPersonalReview> };
    }
    throw error;
  }
}

/**
 * The owner explicitly chooses either a fresh cloud copy or a CAS-protected
 * overwrite from the current device. Racing updates leave the conflict intact.
 */
export async function resolveReadingConflict(
  repo: string, session: CloudSession, id: string, book: LibraryBook, choice: 'cloud' | 'device',
): Promise<LibraryBook> {
  const remote = await fetchVersionedReadingProgress(repo, id, session);
  if (choice === 'cloud') return takeRemoteReading(book, remote);
  try {
    const saved = await writeVersionedReadingProgress(repo, id, session, book, remote.revision);
    return { ...book, progressCloudRevision: saved.revision,
      pendingProgressSync: false, progressSyncConflict: undefined };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) {
      return { ...book, pendingProgressSync: true,
        progressSyncConflict: error.snapshot as CloudRevisionSnapshot<CloudReadingProgress> };
    }
    throw error;
  }
}

export async function resolveReviewConflict(
  repo: string, session: CloudSession, id: string, book: LibraryBook, choice: 'cloud' | 'device',
): Promise<LibraryBook> {
  const remote = await fetchVersionedPersonalReview(repo, id, session);
  if (choice === 'cloud') return takeRemoteReview(book, remote);
  try {
    const saved = await writeVersionedPersonalReview(repo, id, session, book, remote.revision);
    return { ...book, reviewCloudRevision: saved.revision,
      pendingReviewSync: false, reviewSyncConflict: undefined };
  } catch (error) {
    if (error instanceof CloudPersonalConflict) {
      return { ...book, pendingReviewSync: true,
        reviewSyncConflict: error.snapshot as CloudRevisionSnapshot<CloudPersonalReview> };
    }
    throw error;
  }
}
