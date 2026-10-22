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
    expect(contrast('#ffe14a', '#1E2A5A')).toBeGreaterThanOrEqual(4.5);
  });

  it('asks before deleting leaderboard data in the centred confirmation modal', () => {
    const screens = readFileSync(new URL('./Screens.tsx', import.meta.url), 'utf8');
    const dockStart = screens.indexOf('className="settings-dock"');
    const dockEnd = screens.indexOf('DONE</button>', dockStart);
    const dock = screens.slice(dockStart, dockEnd);
    expect(dock).toContain('Delete my leaderboard data');
    expect(dock).not.toContain('shop-note');
    expect(dock).not.toContain('confirmDelete');
    const modalStart = screens.indexOf('{confirmDelete && (');
    const modalEnd = screens.indexOf('{doneNotice && (');
    const modal = screens.slice(modalStart, modalEnd);
    expect(modal).toContain('<ScreenModal');
    expect(modal).toContain('centre-notice');
    expect(modal).toContain('This removes your nickname and scores.');
    expect(modal).toContain('Cancel');
    expect(modal).toContain('onBackdrop={closeDelete}');
  });

  it('keeps the country hint as a plain text link with a 44px target', () => {
    expect(css).toMatch(/\.country-suggest \{[^}]*background: transparent;/s);
    expect(css).toMatch(/\.country-suggest \{[^}]*min-height: 44px;/s);
    expect(css).not.toMatch(/\.country-suggest \{[^}]*background: #ff4f9a;/s);
    expect(contrast('#f7e9c5', '#1E2A5A')).toBeGreaterThanOrEqual(4.5);
  });
});
