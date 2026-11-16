import { describe, expect, it } from 'vitest';
import { novelHeroPalette, novelHeroStyle, NOVEL_HERO_PALETTES, novelHeroBackdrop, novelHeroBackdropUrl, NOVEL_HERO_BACKDROPS } from '../src/lib/novel-hero';

const NOVEL_IDS = Array.from({ length: 150 }, (_, n) => n.toString(16).padStart(24, '0'));

describe('stable, accessible colour variety on novel details', () => {
  it('exposes exactly six non-green palettes', () => {
    expect(NOVEL_HERO_PALETTES).toHaveLength(6);
    expect(new Set(NOVEL_HERO_PALETTES.map(p => p.name)).size).toBe(6);
    for (const palette of NOVEL_HERO_PALETTES) {
      expect(palette.name.toLowerCase()).not.toMatch(/green|jade|forest|teal/);
      for (const colour of [palette.shadow, palette.mid, palette.glow]) {
        expect(colour).toMatch(/^#[a-f0-9]{6}$/);
      }
    }
  });

  it('chooses deterministically by immutable ID across reloads and title changes', () => {
    for (const id of NOVEL_IDS) {
      expect(novelHeroPalette(id)).toBe(novelHeroPalette(id));
      expect(novelHeroStyle(id)).toEqual(novelHeroStyle(id));
    }
    expect(new Set(NOVEL_IDS.map(id => novelHeroPalette(id).name)).size).toBe(6);
  });

  it('exposes the palette through CSS variables without leaking novel metadata', () => {
    const id = '01c88f7de0537852bbd350b1';
    const palette = novelHeroPalette(id);
    expect(novelHeroStyle(id)).toEqual({
      '--novel-hero-shadow': palette.shadow,
      '--novel-hero-mid': palette.mid,
      '--novel-hero-glow': palette.glow,
    });
    expect(JSON.stringify(novelHeroStyle(id))).not.toContain(id);
  });

  it('keeps high contrast for pale hero text across the six brightest backgrounds', () => {
    function luminance(hex: string) {
      const values = [1, 3, 5].map(offset => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
    }
    const text = luminance('#f6f4f8');
    for (const palette of NOVEL_HERO_PALETTES) {
      const lightestBackground = luminance(palette.glow);
      expect((text + 0.05) / (lightestBackground + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('shared nature photography hero backgrounds', () => {
  it('uses twelve unique verified real photographic sources, never faces or per-novel URLs', () => {
    expect(NOVEL_HERO_BACKDROPS).toHaveLength(12);
    expect(new Set(NOVEL_HERO_BACKDROPS.map(x => x.photoId)).size).toBe(12);
    for (const item of NOVEL_HERO_BACKDROPS) {
      expect(item.source).toMatch(/^https:\/\/unsplash\.com\/photos\//);
      expect(item.photographer.length).toBeGreaterThan(0);
      expect(novelHeroBackdropUrl(item.photoId)).toMatch(
        /^https:\/\/images\.unsplash\.com\/photo-\d{10,13}-[a-f0-9]{12}\?auto=format&fit=crop&w=1500&q=80$/);
      expect(item.name).not.toMatch(/portrait|character|person|face|couple|heroine|protagonist/i);
    }
    expect(() => novelHeroBackdropUrl('https://external-site.example/private')).toThrow();
  });

  it('reuses one of twelve images by immutable ID and does not expose novel details', () => {
    expect(new Set(NOVEL_IDS.map(id => novelHeroBackdrop(id).photoId)).size).toBe(12);
    for (const id of NOVEL_IDS) {
      expect(novelHeroBackdrop(id)).toBe(novelHeroBackdrop(id.toUpperCase()));
      expect(JSON.stringify(novelHeroBackdrop(id))).not.toContain(id);
    }
  });

  it('does not reshuffle old photographs when extending the shared pool', () => {
    const oldPool = NOVEL_HERO_BACKDROPS.slice(0, 8);
    const extraPool = NOVEL_HERO_BACKDROPS.slice(8);
    let kept = 0, changed = 0;
    for (const id of NOVEL_IDS) {
      let hash = 2166136261;
      for (const char of 'nature:' + id.toLowerCase()) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      const old = oldPool[(hash >>> 0) % 8];
      const current = novelHeroBackdrop(id);
      if (extraPool.includes(current as (typeof extraPool)[number])) changed++;
      else { expect(current).toBe(old); kept++; }
    }
    expect(kept).toBeGreaterThan(changed);
    expect(changed).toBeGreaterThan(0);
  });

  it('leaves existing accessible six-colour gradients unchanged', () => {
    for (const id of NOVEL_IDS) {
      expect(novelHeroStyle(id)).toEqual({
        '--novel-hero-shadow': novelHeroPalette(id).shadow,
        '--novel-hero-mid': novelHeroPalette(id).mid,
        '--novel-hero-glow': novelHeroPalette(id).glow,
      });
    }
  });
});
