import { describe, expect, it } from 'vitest';
import { novelLibraryPageTitle as title } from '../src/lib/page-titles';

const novel = { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', title: 'Tales of Demons and Gods' };
const collections = [{ id:'bookcase_12345', name:'Fantasy Favourites' }];

describe('TNL browser tab titles', () => {
  it('uses the compact prefix on the home page and every primary shelf', () => {
    expect(title('/')).toBe('TNL - Home Page');
    expect(title('/library')).toBe('TNL - Taiyou Novel Library');
    expect(title('/currently-reading')).toBe('TNL - Currently Reading');
    expect(title('/trying-out')).toBe('TNL - Trying Out');
    expect(title('/to-be-read')).toBe('TNL - To Be Read');
    expect(title('/offline')).toBe('TNL - Available Offline');
    expect(title('/finished')).toBe('TNL - Finished');
    expect(title('/analytics')).toBe('TNL - Analytics');
    expect(title('/advanced-search')).toBe('TNL - Advanced Search');
    expect(title('/master-controls')).toBe('TNL - Master Controls');
  });

  it('uses the real novel name for details, reading, canonical and legacy links', () => {
    expect(title('/novels/tales-of-demons-and-gods', [novel]))
      .toBe('TNL - Tales of Demons and Gods');
    expect(title('/novels/tales-of-demons-and-gods/read/chapter-333', [novel]))
      .toBe('TNL - Tales of Demons and Gods');
    expect(title('/book/aaaaaaaaaaaaaaaaaaaaaaaa', [novel]))
      .toBe('TNL - Tales of Demons and Gods');
    expect(title('/book/aaaaaaaaaaaaaaaaaaaaaaaa/read', [novel]))
      .toBe('TNL - Tales of Demons and Gods');
    expect(title('/novels/tales-of-demons-and-gods', []))
      .toBe('TNL - Novel Library');
  });

  it('labels collection, author and tag pages without exposing immutable IDs', () => {
    expect(title('/collections/bookcase_12345', [], collections))
      .toBe('TNL - Fantasy Favourites');
    expect(title('/collections/bookcase_12345/shelf/finished', [], collections))
      .toBe('TNL - Fantasy Favourites');
    expect(title('/collections/bookcase_12345', [], [{ ...collections[0], deleted: true }]))
      .toBe('TNL - Collections');
    expect(title('/tags/romance')).toBe('TNL - Tag: romance');
    expect(title('/authors/Mad%20Snail')).toBe('TNL - Author: Mad Snail');
  });

  it('supports empty catalogues, unknown routes and refreshed title metadata', () => {
    expect(title('/totally-unknown')).toBe('TNL - Taiyou Novel Library');
    expect(title('/novels/tales-of-demons-and-gods/read', [{ ...novel, title:'Renamed Story' }]))
      .toBe('TNL - Renamed Story');
  });
});
