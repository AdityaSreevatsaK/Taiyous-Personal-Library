import type { CSSProperties } from 'react';

/**
 * Novel-detail colourways are deliberately stable: the same immutable ID
 * always gets the same palette, on any device, theme or reload.
 * Changing a novel title must not shuffle its palette.
 */
export const NOVEL_HERO_PALETTES = [
  { name: 'Midnight navy', shadow: '#14253f', mid: '#243c5b', glow: '#365c85' },
  { name: 'Deep indigo', shadow: '#242344', mid: '#353561', glow: '#514b87' },
  { name: 'Storm slate', shadow: '#263143', mid: '#38485f', glow: '#506982' },
  { name: 'Aubergine', shadow: '#30233d', mid: '#49334f', glow: '#664564' },
  { name: 'Burgundy', shadow: '#3c2334', mid: '#563046', glow: '#75445f' },
  { name: 'Dusk violet', shadow: '#2c2450', mid: '#413668', glow: '#655084' },
] as const;

export function novelHeroPalette(id: string): typeof NOVEL_HERO_PALETTES[number] {
  // 32-bit FNV-1a over immutable IDs, avoiding runtime randomness and flicker.
  let hash = 2166136261;
  for (const char of id.toLowerCase()) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return NOVEL_HERO_PALETTES[(hash >>> 0) % NOVEL_HERO_PALETTES.length];
}

export function novelHeroStyle(id: string): CSSProperties {
  const { shadow, mid, glow } = novelHeroPalette(id);
  return {
    '--novel-hero-shadow': shadow,
    '--novel-hero-mid': mid,
    '--novel-hero-glow': glow,
  } as CSSProperties;
}
