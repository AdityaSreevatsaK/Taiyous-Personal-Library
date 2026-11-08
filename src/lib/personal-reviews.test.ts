import { describe, expect, it } from 'vitest';
import { parseCloudPersonalReview } from './cloud';

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('private cross-device personal notes', () => {
  it('accepts valid saved rating and comments', () => {
    expect(parseCloudPersonalReview({
      version: 1, bookId: id, rating: 9, comments: 'Loved the ending', updatedAt: 1000,
    }, id).comments).toBe('Loved the ending');
  });
  it('accepts a cleared rating while retaining comments', () => {
    expect(parseCloudPersonalReview({
      version: 1, bookId: id, rating: null, comments: 'Still reading', updatedAt: 1001,
    }, id).rating).toBeNull();
  });
  it('refuses documents for a different novel', () => {
    expect(() => parseCloudPersonalReview({
      version: 1, bookId: 'bbbbbbbbbbbbbbbbbbbbbbbb', rating: 8, comments: '', updatedAt: 1,
    }, id)).toThrow();
  });
  it('refuses invalid ratings and oversized comments', () => {
    expect(() => parseCloudPersonalReview({
      version: 1, bookId: id, rating: 11, comments: '', updatedAt: 1,
    }, id)).toThrow();
    expect(() => parseCloudPersonalReview({
      version: 1, bookId: id, rating: 1, comments: 'x'.repeat(10001), updatedAt: 1,
    }, id)).toThrow();
  });
  it('refuses unrecognised schema versions and timestamps', () => {
    expect(() => parseCloudPersonalReview({
      version: 2, bookId: id, rating: null, comments: '', updatedAt: 1,
    }, id)).toThrow();
    expect(() => parseCloudPersonalReview({
      version: 1, bookId: id, rating: null, comments: '', updatedAt: -1,
    }, id)).toThrow();
  });
});
