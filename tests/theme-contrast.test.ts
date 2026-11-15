import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/theme-palettes.css', import.meta.url), 'utf8');
const themes = ['light', 'sepia', 'dark', 'midnight', 'ocean', 'plum'];

function luminance(hex: string): number {
  const values = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
}
function contrast(first: string, second: string): number {
  const [a, b] = [luminance(first), luminance(second)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function tokens(theme: string): Record<string, string> {
  const block = new RegExp('\\.theme-' + theme + ' \\{([^}]+)\\}').exec(css)?.[1] || '';
  return Object.fromEntries([...block.matchAll(/(--[\\w-]+):\\s*(#[0-9a-fA-F]{6})/g)]
    .map(([, name, value]) => [name, value]));
}

describe('WCAG AA colour contrast across all six themes', () => {
  for (const theme of themes) {
    it(theme + ' maintains readable normal-sized text and button labels', () => {
      const palette = tokens(theme);
      for (const surface of ['--bg', '--surface', '--pale', '--surface-soft']) {
        expect(contrast(palette['--text'], palette[surface]), 'body text on ' + theme + '/' + surface)
          .toBeGreaterThanOrEqual(4.5);
        expect(contrast(palette['--subtext'], palette[surface]), 'secondary text on ' + theme + '/' + surface)
          .toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(palette['--accent'], palette['--accent-ink']), 'accent button in ' + theme)
        .toBeGreaterThanOrEqual(4.5);
    });
  }
});
