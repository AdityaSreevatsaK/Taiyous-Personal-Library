/** Shared descriptions of the personal ten-point novel scale. */
export const RATING_LABELS = [
  'Terrible', 'Very Poor', 'Poor', 'Below Average', 'Average',
  'Decent', 'Good', 'Very Good', 'Excellent', 'Masterpiece',
] as const;

/** CSS-only star tones, clamped to the supported ten-point scale. */
export function ratingToneClass(value: number | undefined): string {
  return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 10
    ? 'rating-tone-' + value
    : 'rating-tone-0';
}

export function ratingLabel(value: number): string {
  return Number.isInteger(value) && value >= 1 && value <= 10
    ? RATING_LABELS[value - 1]
    : 'Not rated';
}

/** Present a saved/draft personal rating consistently in every Novel view. */
export function ratingSummary(value: number | undefined): string {
  return value !== undefined && Number.isInteger(value) && value >= 1 && value <= 10
    ? `${value}/10 · ${ratingLabel(value)}`
    : '';
}
