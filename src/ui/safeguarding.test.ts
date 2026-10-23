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

describe('report and country safeguarding', () => {
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

  it('pins the row menu and the confirmations in a centred modal', () => {
    expect(css).toMatch(/\.screen-modal \{[^}]*position: fixed;/s);
    expect(css).toMatch(/\.screen-modal \{[^}]*align-items: center;/s);
    expect(css).toMatch(/\.centre-notice \{[^}]*width: min\(340px, calc\(100vw - 32px\)\);/s);
    expect(css).toMatch(/\.centre-notice p \{[^}]*font-size: 22px;/s);
    expect(css).toMatch(/\.board-sheet button \{[^}]*min-height: 44px;/s);
    expect(css).toMatch(/\.centre-notice \.btn \{[^}]*min-height: 44px;/s);
    expect(contrast('#fffdf8', '#140814')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#fffdf8', '#1E2A5A')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#3b1024', '#ffd0e4')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#24180c', '#f7e9c5')).toBeGreaterThanOrEqual(4.5);
    expect(contrast('#1E2A5A', '#FFD93D')).toBeGreaterThanOrEqual(4.5);
  });

  it('does not offer a locale country suggestion', () => {
    expect(css).not.toContain('.country-suggest');
    const nick = readFileSync(new URL('./NicknameScreen.tsx', import.meta.url), 'utf8');
    expect(nick).not.toContain('Suggested:');
    expect(nick).toContain("submitLabel ?? 'Continue'");
    expect(contrast('#f7e9c5', '#1E2A5A')).toBeGreaterThanOrEqual(4.5);
  });
});
