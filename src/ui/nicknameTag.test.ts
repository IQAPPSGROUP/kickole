import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function channel(hex: string, shift: number): number {
  const value = (parseInt(hex.slice(1), 16) >> shift) & 255;
  const s = value / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function contrast(foreground: string, background: string): number {
  const lum = (hex: string) => 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0);
  const hi = Math.max(lum(foreground), lum(background));
  const lo = Math.min(lum(foreground), lum(background));
  return (hi + 0.05) / (lo + 0.05);
}

describe('nickname picker colours', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  it('paints Pick one for me pink and SAVE cream, both at least 4.5:1', () => {
    expect(css).toContain('.nick-form .btn.primary.nick-shuffle');
    expect(css).toMatch(/\.nick-form \.btn\.primary\.nick-shuffle \{[^}]*background: #ff4f9a;/s);
    expect(css).toMatch(/\.nick-form \.btn\.primary \{[^}]*background: #fffdf8;/s);
    expect(css).toMatch(/\.nick-form \.btn\.primary \{[^}]*min-height: 44px;/s);
    expect(contrast('#140814', '#ff4f9a')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#140814', '#fffdf8')).toBeGreaterThanOrEqual(4.5);
  });

  it('puts the live tag on the alley brick, not a plain text box', () => {
    expect(css).toContain("url('./ui/brick-wall.jpg')");
    expect(css).toContain('.nick-preview-tag');
    expect(css).not.toMatch(/\.nick-preview \{[^}]*wall-tile/s);
  });

  it('keeps the pre-run board below the alley mural', () => {
    expect(css).not.toContain('.world-rank');
    expect(css).toMatch(/\.run-lineup \{[^}]*bottom: max\(12px, var\(--sat-b\)\);/s);
    expect(css).toMatch(/\.run-lineup \{[^}]*max-height: 58%;/s);
  });
});
