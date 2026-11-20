/** Browser-tab titles use a short, consistent TNL prefix on every route. */
import type { LibraryBook } from '../types';
import type { BookCollection } from './collections';
import { parseLibraryRoute, resolveNovelRoute } from './routes';
import { parseLibraryViewPath } from './library-routes';

type NamedNovel = Pick<LibraryBook, 'id' | 'title'>;
type NamedCollection = Pick<BookCollection, 'id' | 'name' | 'deleted'>;

const SHELF_TITLES: Record<string, string> = {
  all: 'Taiyou Novel Library',
  reading: 'Currently Reading',
  trying: 'Trying Out',
  offline: 'Available Offline',
  finished: 'Finished',
  unread: 'To Be Read',
  analytics: 'Analytics',
};

export function novelLibraryPageTitle(
  path: string, books: readonly NamedNovel[] = [], collections: readonly NamedCollection[] = [],
): string {
  const prefix = 'TNL - ';
  const normal = path.length > 1 ? path.replace(/\/$/, '') : path;
  if (normal === '/') return prefix + 'Home Page';
  if (normal === '/master-controls') return prefix + 'Master Controls';
  const novelRoute = parseLibraryRoute(normal);
  if (novelRoute.page !== 'library') {
    const novel = resolveNovelRoute(novelRoute, books);
    return prefix + (novel?.title || 'Novel Library');
  }
  const view = parseLibraryViewPath(normal);
  if (view.advanced) return prefix + 'Advanced Search';
  if (view.collectionId) {
    const found = collections.find(item => item.id === view.collectionId && !item.deleted);
    return prefix + (found?.name || 'Collections');
  }
  if (view.tag) return prefix + 'Tag: ' + view.tag;
  if (view.author) return prefix + 'Author: ' + view.author;
  return prefix + (SHELF_TITLES[view.filter] || 'Taiyou Novel Library');
}
