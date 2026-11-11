/** Small dependency-free router for bookmarkable novel URLs. */
export type LibraryRoute =
  | { page: 'library' }
  | { page: 'details' | 'reader'; id: string };

const ID = '[0-9a-f]{24}';
const DETAILS = new RegExp('^/book/(' + ID + ')/?$');
const READER = new RegExp('^/book/(' + ID + ')/read/?$');

export function parseLibraryRoute(path: string): LibraryRoute {
  const reader = READER.exec(path);
  if (reader) return { page: 'reader', id: reader[1] };
  const details = DETAILS.exec(path);
  if (details) return { page: 'details', id: details[1] };
  return { page: 'library' };
}

export function novelUrl(id: string, reader = false): string {
  if (!new RegExp('^' + ID + '$').test(id)) throw new Error('Invalid novel identifier');
  return '/book/' + id + (reader ? '/read' : '');
}
