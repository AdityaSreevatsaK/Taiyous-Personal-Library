import { describe, expect, it } from 'vitest';
import { ratingLabel, ratingSummary, RATING_LABELS } from '../src/lib/ratings';

describe('Ten-point personal ratings', () => {
  it('provides ten different, increasingly favourable labels', () => {
    expect(RATING_LABELS).toHaveLength(10);
    expect(new Set(RATING_LABELS).size).toBe(10);
    expect(ratingLabel(1)).toBe('Terrible');
    expect(ratingLabel(10)).toBe('Masterpiece');
  });
  it('shows the same human-readable score on cards, desktop details and mobile', () => {
    const expected = [
      '1/10 · Terrible', '2/10 · Very Poor', '3/10 · Poor',
      '4/10 · Below Average', '5/10 · Average', '6/10 · Decent',
      '7/10 · Good', '8/10 · Very Good', '9/10 · Excellent',
      '10/10 · Masterpiece',
    ];
    expect(Array.from({ length: 10 }, (_, i) => ratingSummary(i + 1))).toEqual(expected);
    expect(ratingLabel(8)).toBe('Very Good');
  });

  it('does not show any summary for unrated or invalid saved scores', () => {
    for (const value of [undefined, 0, -1, 11, 5.5, NaN, Infinity]) {
      expect(ratingSummary(value)).toBe('');
    }
  });

  it('never invents a rating for an invalid number', () => {
    for (const n of [0, -1, 11, 4.5, NaN]) expect(ratingLabel(n)).toBe('Not rated');
  });
});
