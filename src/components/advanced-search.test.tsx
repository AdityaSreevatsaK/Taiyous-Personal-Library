import { describe, expect, it } from 'vitest';
import { defaultSearchCriteria, matchesAdvancedSearch } from './AdvancedSearch';
import type { LibraryBook } from '../types';

const first: LibraryBook = {
  id: 'abc', title: 'Martial Immortality', author: 'Novel Author',
  originalFileName: 'martial.epub', importedAt: 1, size: 500, progress: 0,
  sourceTags: ['Cultivation', 'Adventure'], personalTags: ['Favourite'],
  personalRating: 9, personalReview: 'Excellent cultivation and romance.',
};
const second: LibraryBook = {
  ...first, id: 'def', title: 'Secret Kingdom', author: 'Other Author',
  sourceTags: ['Fantasy'], personalTags: [], personalRating: 5,
  personalReview: 'Interesting mystery and politics.',
};

describe('advanced novel search', () => {
  const offline = new Set(['abc']);
  it('shows all novels without active filters', () => {
    expect(matchesAdvancedSearch(first, defaultSearchCriteria, offline)).toBe(true);
    expect(matchesAdvancedSearch(second, defaultSearchCriteria, offline)).toBe(true);
  });
  it('matches title or author and personal comment text', () => {
    const criteria = { ...defaultSearchCriteria, name: 'martial', comments: 'romance' };
    expect(matchesAdvancedSearch(first, criteria, offline)).toBe(true);
    expect(matchesAdvancedSearch(second, criteria, offline)).toBe(false);
  });
  it('AND requires all selected tags and a rating in range', () => {
    const criteria = { ...defaultSearchCriteria, tags: ['Cultivation','Favourite'], minRating: 8 };
    expect(matchesAdvancedSearch(first, criteria, offline)).toBe(true);
    expect(matchesAdvancedSearch(second, criteria, offline)).toBe(false);
  });
  it('OR matches any selected tag, or rating, or comment', () => {
    const criteria = { ...defaultSearchCriteria, mode: 'any' as const,
      tags: ['Fantasy', 'Missing'], minRating: 8, comments: 'romance' };
    expect(matchesAdvancedSearch(first, criteria, offline)).toBe(true);
    expect(matchesAdvancedSearch(second, criteria, offline)).toBe(true);
    expect(matchesAdvancedSearch({ ...second, sourceTags: [], personalRating: undefined, personalReview: '' }, criteria, offline)).toBe(false);
  });
  it('matches the downloaded set only when requested', () => {
    const criteria = { ...defaultSearchCriteria, offlineOnly: true };
    expect(matchesAdvancedSearch(first, criteria, offline)).toBe(true);
    expect(matchesAdvancedSearch(second, criteria, offline)).toBe(false);
  });
  it('does not treat an unrated book as 0 out of 10', () => {
    const criteria = { ...defaultSearchCriteria, minRating: 1 };
    expect(matchesAdvancedSearch({ ...first, personalRating: undefined }, criteria, offline)).toBe(false);
  });
});
