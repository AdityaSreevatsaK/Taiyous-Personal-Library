import { describe, expect, it } from 'vitest';
import { novelHeroPalette, novelHeroStyle, NOVEL_HERO_PALETTES } from '../src/lib/novel-hero';

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
