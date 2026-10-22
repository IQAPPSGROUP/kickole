import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { pointerOpensTheCourt } from './boardGesture';

function target(hit: string | null) {
  return {
    closest(selector: string) {
      return hit != null && selector === hit ? {} : null;
    },
  };
}

describe('court gestures leave the leaderboard alone', () => {
  it('kicks on the canvas and ignores the sheet, pre-run board, and menus', () => {
    expect(pointerOpensTheCourt(target(null) as never)).toBe(true);
    expect(pointerOpensTheCourt(null)).toBe(true);
    expect(pointerOpensTheCourt(target('[data-board-sheet]') as never)).toBe(false);
    expect(pointerOpensTheCourt(target('.run-lineup-hit') as never)).toBe(false);
    expect(pointerOpensTheCourt(target('.screen') as never)).toBe(false);
    expect(pointerOpensTheCourt(target('.screen-modal') as never)).toBe(false);
  });

  it('gives the sheet its own touch scroll and a sticky rank row', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.leaderboard-scroll \{[^}]*overflow-y: auto;/s);
    expect(css).toMatch(/\.leaderboard-scroll \{[^}]*-webkit-overflow-scrolling: touch;/s);
    expect(css).toMatch(/\.leaderboard-scroll \{[^}]*touch-action: pan-y;/s);
    expect(css).toMatch(/\.leaderboard-you \{[^}]*position: sticky;/s);
    expect(css).toMatch(/\.leaderboard-close \{[^}]*min-height: 52px;/s);
    expect(css).toMatch(/\.leaderboard-sheet \{[^}]*env\(safe-area-inset-top/s);
    expect(css).toMatch(/\.leaderboard-periods \{[^}]*overflow-x: auto;/s);
    expect(css).not.toContain('.world-rank');
  });
});
