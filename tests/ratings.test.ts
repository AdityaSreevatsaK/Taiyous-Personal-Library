import { describe, expect, it } from 'vitest';
import { ratingLabel, RATING_LABELS } from '../src/lib/ratings';

describe('Ten-point personal ratings', () => {
  it('provides ten different, increasingly favourable labels', () => {
    expect(RATING_LABELS).toHaveLength(10);
    expect(new Set(RATING_LABELS).size).toBe(10);
    expect(ratingLabel(1)).toBe('Terrible');
    expect(ratingLabel(10)).toBe('Masterpiece');
  });
  it('never invents a rating for an invalid number', () => {
    for (const n of [0, -1, 11, 4.5, NaN]) expect(ratingLabel(n)).toBe('Not rated');
  });
});
