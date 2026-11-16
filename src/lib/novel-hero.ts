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

/**
 * Twelve curated, people-free landscapes and celestial night-sky photographs,
 * reused across the entire library. Sources are genuine Unsplash images, NOT generated illustrations.
 * The public Unsplash CDN is the only external image domain added to CSP.
 * Every image has the same licence; attribution is documented separately.
 *
 * These URLs include no private title, user data, novel identifier, or token.
 * They are intentionally optional: offline / unavailable CDN => original
 * opaque hero colourway, with no broken-image placeholder.
 */
export const NOVEL_HERO_BACKDROPS = [
  {
    name: 'Twilight mountain mist',
    photoId: 'photo-1758637689971-fe6124e7cabd',
    photographer: '志远 杨',
    source: 'https://unsplash.com/photos/misty-mountains-shrouded-in-blue-twilight-fog-kzH-sVU5pqs',
    position: 'center 50%',
  },
  {
    name: 'Dramatic mountain silhouettes in fog',
    photoId: 'photo-1768684160371-566aadb7785e',
    photographer: 'Filip Kvasnak',
    source: 'https://unsplash.com/photos/misty-mountains-shrouded-in-dark-clouds-at-dawn-tvJX2DTeCiQ',
    position: 'center 50%',
  },
  {
    name: 'Dark highland mist',
    photoId: 'photo-1762878099418-e174fcea0957',
    photographer: 'Viktoriia Ananeva',
    source: 'https://unsplash.com/photos/dark-moody-mountains-shrouded-in-mist-N47Pk5QhRfw',
    position: 'center 52%',
  },
  {
    name: 'Milky Way above remote mountains',
    photoId: 'photo-1788238025184-0fc6fb3ca330',
    photographer: 'Ashwini Chaudhary',
    source: 'https://unsplash.com/photos/starry-night-sky-over-mountains-z-u4kAj3JeY',
    position: 'center 47%',
  },
  {
    name: 'Dawn over a quiet lake',
    photoId: 'photo-1759434192754-1ae85603cf8a',
    photographer: 'Jonny Gios',
    source: 'https://unsplash.com/photos/misty-lake-reflects-sunlit-mountains-at-dawn-cpAxb1E57zE',
    position: 'center 48%',
  },
  {
    name: 'Celestial night over the Dolomites',
    photoId: 'photo-1765476608471-c30c09564def',
    photographer: 'Marek Piwnicki',
    source: 'https://unsplash.com/photos/snowy-mountains-under-a-starry-night-sky-SumjjLhysZM',
    position: 'center 48%',
  },
  {
    name: 'Snowy mountains at dusk',
    photoId: 'photo-1767987470398-60f61e270383',
    photographer: 'Chris Weiher',
    source: 'https://unsplash.com/photos/snow-capped-mountains-reflected-in-a-lake-at-sunset-3epCdVoYCds',
    position: 'center 46%',
  },
  {
    name: 'Stars above a mountain lake',
    photoId: 'photo-1765921964635-946e29733faf',
    photographer: 'Dhaivat Shah',
    source: 'https://unsplash.com/photos/starry-night-sky-over-mountains-and-a-lake-8W9nKu1PLu4',
    position: 'center 52%',
  },
  {
    name: 'Cherry blossoms by a tranquil lake',
    photoId: 'photo-1775924545566-235b85032b57',
    photographer: 'Ryuta',
    source: 'https://unsplash.com/photos/cherry-blossoms-line-a-tranquil-lake-under-a-clear-sky-jUyd5DMnalg',
    position: 'center 48%',
  },
  {
    name: 'Northern lights above snowy mountains',
    photoId: 'photo-1780678839895-5db70630e0ff',
    photographer: 'Rafael Peier',
    source: 'https://unsplash.com/photos/northern-lights-illuminate-a-starry-sky-over-snowy-mountains-XXX2uavaR38',
    position: 'center 49%',
  },
  {
    name: 'Sunset over desert dunes',
    photoId: 'photo-1542810242-fdbf6379237b',
    photographer: 'Francesco Ungaro',
    source: 'https://unsplash.com/photos/the-sun-is-setting-over-a-desert-with-sand-dunes-tSR133k8Diw',
    position: 'center 50%',
  },
  {
    name: 'Atlantic cliffs and sunset waves',
    photoId: 'photo-1783358915097-314018b882e2',
    photographer: 'Ivan Rohovchenko',
    source: 'https://unsplash.com/photos/ocean-waves-crash-against-rugged-coastal-cliffs-at-sunset-IQJEiVUBeZs',
    position: 'center 50%',
  },
] as const;

export function novelHeroBackdrop(id: string) {
  // Keep the original eight assignments stable when extending the pool.
  // Only novels explicitly assigned to the new extension change their image.
  const hashText = (text: string) => {
    let hash = 2166136261;
    for (const char of text) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };
  const normalisedId = id.toLowerCase();
  const originalIndex = hashText('nature:' + normalisedId) % 8;
  const extraCount = NOVEL_HERO_BACKDROPS.length - 8;
  if (extraCount > 0) {
    const extraHash = hashText('nature-extra-v2:' + normalisedId);
    // One third of novels use the four new landscapes; otherwise keep the
    // exact backdrop already associated with the book.
    if (extraHash % 3 === 0) {
      return NOVEL_HERO_BACKDROPS[8 + (Math.floor(extraHash / 3) % extraCount)];
    }
  }
  return NOVEL_HERO_BACKDROPS[originalIndex];
}

export function novelHeroBackdropUrl(photoId: string, width: 840 | 1500 = 1500): string {
  // Known fixed Unsplash photo ID only. Reject arbitrary URLs/user input.
  if (!/^photo-\d{10,13}-[0-9a-f]{12}$/.test(photoId) ||
      !NOVEL_HERO_BACKDROPS.some(item => item.photoId === photoId)) {
    throw new Error('Unrecognised nature backdrop');
  }
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&q=80`;
}
