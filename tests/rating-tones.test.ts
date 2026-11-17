import { describe, expect, it } from 'vitest';
import { ratingToneClass } from '../src/lib/ratings';

describe('rating star tones', () => {
  it('uses a distinct tone for each supported value', () => {
    expect(new Set(Array.from({ length: 10 }, (_, index) => ratingToneClass(index + 1))).size).toBe(10);
  });
  it('is safe for unrated, out of range and non-integer values', () => {
    for (const value of [undefined, -1, 0, 11, 5.5, NaN, Infinity]) {
      expect(ratingToneClass(value)).toBe('rating-tone-0');
    }
    expect(ratingToneClass(10)).toBe('rating-tone-10');
  });
});
