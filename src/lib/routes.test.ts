import { describe, expect, it } from 'vitest';
import { parseLibraryRoute, novelUrl } from './routes';
const id = '0123456789abcdef01234567';
describe('bookmarks and browser history', () => {
  it('opens exactly one novel detail or reader URL by ID', () => {
    expect(parseLibraryRoute(novelUrl(id))).toEqual({ page: 'details', id });
    expect(parseLibraryRoute(novelUrl(id, true))).toEqual({ page: 'reader', id });
    expect(parseLibraryRoute(novelUrl(id, true) + '/')).toEqual({ page: 'reader', id });
  });
  it('does not parse arbitrary or unsupported paths as books', () => {
    expect(parseLibraryRoute('/')).toEqual({ page: 'library' });
    expect(parseLibraryRoute('/api/oauth/login')).toEqual({ page: 'library' });
    expect(parseLibraryRoute('/book/../../secrets')).toEqual({ page: 'library' });
    expect(() => novelUrl('bad-id')).toThrow();
  });
});
