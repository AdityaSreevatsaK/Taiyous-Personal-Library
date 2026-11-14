import { describe, expect, it } from 'vitest';
import {
  libraryShelfUrl, libraryTagUrl, libraryCollectionUrl, parseLibraryViewPath,
  type ShelfFilter,
} from '../src/lib/library-routes';

describe('deep-linkable library sections', () => {
  const shelves: Array<[ShelfFilter,string]> = [
    ['all','/'], ['trying','/trying-out'], ['reading','/currently-reading'],
    ['unread','/to-be-read'],['finished','/finished'],['offline','/offline'],['analytics','/analytics'],
  ];
  it.each(shelves)('%s uses a stable address and can be loaded directly', (filter,path) => {
    expect(libraryShelfUrl(filter)).toBe(path);
    expect(parseLibraryViewPath(path)).toEqual({filter,tag:'',collectionId:'',advanced:false});
    expect(parseLibraryViewPath(path+'/' )).toEqual({filter,tag:'',collectionId:'',advanced:false});
  });
  it('makes advanced search addressable independently of normal shelves', () => {
    expect(parseLibraryViewPath('/advanced-search')).toEqual({
      filter:'all',tag:'',collectionId:'',advanced:true,
    });
  });
  it('preserves human-readable Unicode and spaced tags across reloads', () => {
    for (const tag of ['Mystery','Martial Arts','Xuanhuan','仙侠','Time & Space','Romance/?!']) {
      if (tag.includes('/')) continue;
      const url = libraryTagUrl(tag);
      expect(url).toContain('/tags/');
      expect(parseLibraryViewPath(url).tag).toBe(tag.toLocaleLowerCase());
      expect(parseLibraryViewPath(url).collectionId).toBe('');
    }
    expect(libraryTagUrl('Martial Arts','reading')).toBe('/tags/martial%20arts/shelf/reading');
    expect(parseLibraryViewPath('/tags/martial%20arts/shelf/reading')).toMatchObject({
      filter:'reading',tag:'martial arts',
    });
    expect(libraryTagUrl('Fantasy','offline')).toBe('/tags/fantasy/shelf/offline');
  });
  it('preserves immutable collection ID and chosen shelf', () => {
    const id='collection-20261114';
    expect(libraryCollectionUrl(id)).toBe('/collections/collection-20261114');
    expect(parseLibraryViewPath(libraryCollectionUrl(id))).toMatchObject({
      filter:'all',collectionId:id,tag:'',
    });
    expect(parseLibraryViewPath(libraryCollectionUrl(id,'finished'))).toMatchObject({
      filter:'finished',collectionId:id,
    });
  });
  it('never mistakes malformed or unsafe routes for valid collection or tag filters', () => {
    for (const bad of ['','//','../../bad','/novels/crazy-detective/read/chapter-6',
      '/tags/%2Fadmin','/tags/%00evil','/tags/romance/shelf/analytics',
      '/tags/romance/shelf/missing','/collections/../../etc',
      '/collections/not-an-id/shelf/analytics','/analytics/private']) {
      expect(parseLibraryViewPath(bad)).toMatchObject({filter:'all',tag:'',collectionId:''});
    }
    expect(() => libraryCollectionUrl('bad id')).toThrow();
    expect(() => libraryTagUrl('')).toThrow();
    expect(() => libraryTagUrl('forbidden/slash')).toThrow();
    expect(() => libraryTagUrl('Fantasy','analytics')).toThrow();
  });
});
