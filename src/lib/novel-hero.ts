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

/** Deterministic decorative jacket palette for books with no stored cover. */
export function generatedCoverVariant(id: string): number {
  let hash = 2166136261;
  for (const char of ('jacket:' + id.toLowerCase())) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 6;
}

/**
 * A fresh mix of genuine editorial photographs: historic reading rooms,
 * celestial skies and dramatic landscapes. The photo is atmospheric UI
 * decoration, not the novel's cover. No search terms, titles or dataset
 * credentials leave this browser.
 */
export const NOVEL_HERO_BACKDROPS = [
  {
    name: 'Vaulted historic reading room',
    photoId: 'photo-1505488387362-48bc38155987',
    photographer: 'Unsplash contributor',
    source: 'https://unsplash.com/fr/s/photos/biblioth%C3%A8que-sombre',
    position: 'center 47%',
    category: 'library',
  },
  {
    name: 'Gilded archive and bookshelves',
    photoId: 'photo-1660700023707-d65c9b1e4e59',
    photographer: 'J. Balla',
    source: 'https://unsplash.com/@jballa',
    position: 'center 50%',
    category: 'library',
  },
  {
    name: 'Milky Way above high mountains',
    photoId: 'photo-1788238025184-0fc6fb3ca330',
    photographer: 'Ashwini Chaudhary',
    source: 'https://unsplash.com/photos/starry-night-sky-over-mountains-z-u4kAj3JeY',
    position: 'center 42%',
    category: 'celestial',
  },
  {
    name: 'Stars above a quiet mountain lake',
    photoId: 'photo-1765921964635-946e29733faf',
    photographer: 'Dhaivat Shah',
    source: 'https://unsplash.com/photos/starry-night-sky-over-mountains-and-a-lake-8W9nKu1PLu4',
    position: 'center 49%',
    category: 'celestial',
  },
  {
    name: 'Northern lights over snow peaks',
    photoId: 'photo-1780678839895-5db70630e0ff',
    photographer: 'Rafael Peier',
    source: 'https://unsplash.com/photos/northern-lights-illuminate-a-starry-sky-over-snowy-mountains-XXX2uavaR38',
    position: 'center 46%',
    category: 'celestial',
  },
  {
    name: 'Sunset over ancient-looking desert dunes',
    photoId: 'photo-1542810242-fdbf6379237b',
    photographer: 'Francesco Ungaro',
    source: 'https://unsplash.com/photos/the-sun-is-setting-over-a-desert-with-sand-dunes-tSR133k8Diw',
    position: 'center 51%',
    category: 'landscape',
  },
  {
    name: 'Blue twilight mountain silhouettes',
    photoId: 'photo-1758637689971-fe6124e7cabd',
    photographer: '志远 杨',
    source: 'https://unsplash.com/photos/misty-mountains-shrouded-in-blue-twilight-fog-kzH-sVU5pqs',
    position: 'center 47%',
    category: 'landscape',
  },
] as const;

export function novelHeroBackdrop(id: string) {
  let hash = 2166136261;
  for (const char of ('backdrop-v3:' + id.toLowerCase())) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return NOVEL_HERO_BACKDROPS[(hash >>> 0) % NOVEL_HERO_BACKDROPS.length];
}

/** Only vetted static Unsplash photo IDs; never form an external URL from novel metadata. */
export function novelHeroBackdropUrl(photoId: string, width: 840 | 1500 = 1500): string {
  if (!NOVEL_HERO_BACKDROPS.some(item => item.photoId === photoId)) {
    throw new Error('Unrecognised novel backdrop');
  }
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`;
}
