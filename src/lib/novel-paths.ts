/**
 * Shared storage path contract for the browser and Cloudflare Functions.
 *
 * The Storage Controller keeps 24-hex-character IDs unchanged while supporting
 * BOTH these catalogue-authoritative directories:
 *   data/novels/<id>/
 *   data/novels/<id> - <human-readable label>/
 *
 * The label is an immutable *folder label*, not necessarily the book's current
 * title. Never reconstruct an existing folder from metadata.title.
 *
 * Keep this validator aligned with taiyou_storage/paths.py in the controller.
 */
export const NOVEL_ID = /^[a-f0-9]{24}$/;
export const COVER_EXTENSIONS = ['jpg', 'png', 'webp', 'jpeg'] as const;
export type NovelFileName = 'source.epub' | 'original.zip' |
  'cover.jpg' | 'cover.png' | 'cover.webp' | 'cover.jpeg';

const NOVEL_PATH =
  /^data\/novels\/([a-f0-9]{24})(?: - ([\p{L}\p{N}_ .,!'()+&-]{1,96}))?\/(source\.epub|original\.zip|cover\.(?:jpg|png|webp|jpeg))$/u;

export interface NovelPath {
  id: string;
  directory: string;
  fileName: NovelFileName;
  readable: boolean;
}

export function parseNovelFilePath(path: unknown): NovelPath | null {
  if (typeof path !== 'string') return null;
  const match = NOVEL_PATH.exec(path);
  if (!match) return null;
  const label = match[2];
  // The controller disallows repeated dots and leading/trailing whitespace
  // or dots. Segments, URL escapes, backslashes and traversal are all banned.
  if (label !== undefined &&
      (label.includes('..') || label !== label.replace(/^[ .]+|[ .]+$/g, ''))) return null;
  return {
    id: match[1],
    directory: 'data/novels/' + match[1] + (label === undefined ? '' : ' - ' + label),
    fileName: match[3] as NovelFileName,
    readable: label !== undefined,
  };
}

export function novelFolderFromEpubPath(bookId: string, epubPath: unknown): string | null {
  if (!NOVEL_ID.test(bookId)) return null;
  const parsed = parseNovelFilePath(epubPath);
  return parsed && parsed.id === bookId && parsed.fileName === 'source.epub'
    ? parsed.directory : null;
}

export interface NovelCataloguePaths {
  id: string;
  epubPath: string;
  archivePath?: string;
  coverPath?: string;
  metadata?: { coverPath?: unknown };
}

/** All declared EPUB/ZIP/cover files must stay inside this exact ID's folder. */
export function verifiedNovelFolder(entry: NovelCataloguePaths): string | null {
  const folder = novelFolderFromEpubPath(entry.id, entry.epubPath);
  if (!folder) return null;
  if (entry.archivePath !== undefined && entry.archivePath !== folder + '/original.zip') return null;
  for (const cover of [entry.coverPath, entry.metadata?.coverPath]) {
    if (cover === undefined) continue;
    const parsed = parseNovelFilePath(cover);
    if (!parsed || parsed.id !== entry.id || parsed.directory !== folder ||
        !parsed.fileName.startsWith('cover.')) return null;
  }
  return folder;
}

export function coverPathForEntry(
  entry: Pick<NovelCataloguePaths, 'id' | 'epubPath' | 'coverPath' | 'metadata'>,
): string | undefined {
  if (!verifiedNovelFolder(entry)) return undefined;
  return entry.coverPath ?? (typeof entry.metadata?.coverPath === 'string'
    ? entry.metadata.coverPath : undefined);
}

/** Controller-compatible naming for optional future readable *new* imports.
 * This helper is not used to rename existing novels during the migration.
 */
export function readableNovelFolder(bookId: string, title: string): string {
  if (!NOVEL_ID.test(bookId)) throw new Error('Invalid novel identifier');
  let label = title.normalize('NFKC')
    .replace(/[^\p{L}\p{N}_ .,!'()+&-]/gu, ' ')
    .replace(/\.{2,}/g, '.')
    .replace(/\s+/g, ' ')
    .trim().replace(/^[ .]+|[ .]+$/g, '');
  label = Array.from(label).slice(0, 96).join('').replace(/[ .]+$/g, '');
  return 'data/novels/' + bookId + ' - ' + (label || 'Untitled');
}
