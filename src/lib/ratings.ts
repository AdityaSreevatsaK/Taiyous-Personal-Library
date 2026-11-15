/** Shared descriptions of the personal ten-point novel scale. */
export const RATING_LABELS = [
  'Terrible', 'Very poor', 'Poor', 'Below average', 'Average',
  'Decent', 'Good', 'Very good', 'Excellent', 'Masterpiece',
] as const;

export function ratingLabel(value: number): string {
  return Number.isInteger(value) && value >= 1 && value <= 10
    ? RATING_LABELS[value - 1]
    : 'Not rated';
}
