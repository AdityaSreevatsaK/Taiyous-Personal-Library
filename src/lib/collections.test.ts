import { describe, expect, it } from 'vitest';
import { mergeCollections, validateCollections, type BookCollection } from './collections';

const base: BookCollection = { id: 'collection_12345', name: 'Harry Potter', bookIds: ['aaaaaaaaaaaaaaaaaaaaaaaa'], updatedAt: 100 };

describe('personal collections', () => {
  it('keeps collection names separate from genres and validates membership', () => {
    expect(validateCollections({ version: 1, collections: [base] })).toEqual([base]);
  });
  it('rejects invalid book IDs or duplicate collection IDs', () => {
    expect(() => validateCollections({ version: 1, collections: [{ ...base, bookIds: ['not-an-epub-id'] }] })).toThrow();
    expect(() => validateCollections({ version: 1, collections: [base, base] })).toThrow();
  });
  it('merges independent collections without losing either one', () => {
    const second: BookCollection = { id: 'collection_67890', name: 'Another Series', bookIds: [], updatedAt: 101 };
    expect(mergeCollections([base], [second])).toHaveLength(2);
  });
  it('prefers a later membership edit and preserves deletion tombstones', () => {
    const edited = { ...base, bookIds: [...base.bookIds, 'bbbbbbbbbbbbbbbbbbbbbbbb'], updatedAt: 200 };
    expect(mergeCollections([base], [edited])).toEqual([edited]);
    const removed = { ...base, deleted: true, updatedAt: 250 };
    expect(mergeCollections([edited], [removed])).toEqual([removed]);
  });
  it('deduplicates novel memberships without disturbing names', () => {
    expect(validateCollections({ version: 1, collections: [{ ...base, bookIds: [...base.bookIds, ...base.bookIds] }] })[0].bookIds).toHaveLength(1);
  });
});
