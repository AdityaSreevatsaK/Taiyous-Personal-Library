/** Directly addressable Library views. No novel or collection data is stored in URLs. */
export type ShelfFilter = 'all' | 'trying' | 'reading' | 'unread' | 'finished' | 'offline' | 'analytics';
export interface LibraryView {
  filter: ShelfFilter;
  tag: string;
  collectionId: string;
  advanced: boolean;
}

const BASE_PATHS: Record<ShelfFilter,string> = {
  all: '/', trying: '/trying-out', reading: '/currently-reading',
  unread: '/to-be-read', finished: '/finished', offline: '/offline',
  analytics: '/analytics',
};
const PATH_FILTERS = Object.fromEntries(Object.entries(BASE_PATHS).map(([key,path]) => [path,key])) as Record<string,ShelfFilter>;
const SCOPED_FILTERS = new Set<ShelfFilter>(['all','trying','reading','unread','finished','offline']);
const COLLECTION_ID = /^[A-Za-z0-9_-]{8,100}$/;

export function libraryShelfUrl(filter: ShelfFilter): string {
  return BASE_PATHS[filter];
}

export function libraryTagUrl(tag: string, filter: ShelfFilter = 'all'): string {
  const name = tag.trim().toLocaleLowerCase();
  if (!name || name.length > 90 || /[\u0000-\u001f/\\]/.test(name) || name === '.' || name === '..') throw new Error('Invalid tag');
  if (!SCOPED_FILTERS.has(filter)) throw new Error('Invalid tag shelf');
  return '/tags/' + encodeURIComponent(name) + (filter === 'all' ? '' : '/shelf/' + filter);
}

export function libraryCollectionUrl(id: string, filter: ShelfFilter = 'all'): string {
  if (!COLLECTION_ID.test(id)) throw new Error('Invalid collection identifier');
  if (!SCOPED_FILTERS.has(filter)) throw new Error('Invalid collection shelf');
  return '/collections/' + encodeURIComponent(id) + (filter === 'all' ? '' : '/shelf/' + filter);
}

export function parseLibraryViewPath(path: string): LibraryView {
  const ordinary = (filter: ShelfFilter = 'all', advanced = false): LibraryView =>
    ({filter, tag:'', collectionId:'', advanced});
  const normal = path.length > 1 ? path.replace(/\/$/, '') : path;
  if (normal === '/advanced-search') return ordinary('all', true);
  if (Object.prototype.hasOwnProperty.call(PATH_FILTERS,normal)) return ordinary(PATH_FILTERS[normal]);
  const tagMatch = /^\/tags\/([^/]+)(?:\/shelf\/(all|trying|reading|unread|finished|offline))?$/.exec(normal);
  if (tagMatch) {
    try {
      const decoded = decodeURIComponent(tagMatch[1]);
      if (!decoded || decoded.length > 90 || /[\u0000-\u001f/\\]/.test(decoded) || decoded === '.' || decoded === '..') return ordinary();
      return {filter:(tagMatch[2] || 'all') as ShelfFilter, tag:decoded, collectionId:'', advanced:false};
    } catch { return ordinary(); }
  }
  const collectionMatch = /^\/collections\/([A-Za-z0-9_-]{8,100})(?:\/shelf\/(all|trying|reading|unread|finished|offline))?$/.exec(normal);
  if (collectionMatch) return {filter:(collectionMatch[2] || 'all') as ShelfFilter, tag:'', collectionId:collectionMatch[1],advanced:false};
  return ordinary();
}
