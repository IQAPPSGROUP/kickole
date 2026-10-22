import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RUN_LINEUP_MS } from './RunLineup';

describe('pre-run leaderboard', () => {
  it('holds the preview for about three seconds', () => {
    expect(RUN_LINEUP_MS).toBe(3000);
  });

  it('pins the card to the bottom so it stays under the mural', () => {
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.run-lineup \{[^}]*bottom: max\(12px, var\(--sat-b\)\);/s);
    expect(css).toMatch(/\.run-lineup \{[^}]*max-height: 58%;/s);
    expect(css).not.toContain('.world-rank');
  });

  it('takes the top five from the same board call the full sheet uses', () => {
    const source = readFileSync(new URL('./RunLineup.tsx', import.meta.url), 'utf8');
    expect(source).toContain("board.board('all', 'world', score, 5)");
  });

  it('shows the world board only after opt-in and a best score otherwise', () => {
    const app = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('leaderboardOn && board ?');
    expect(app).toContain('<BestLineup best={snap.save.best}');
    expect(app).toContain('<RunLineup board={board}');
  });

  it('prints the opted-in place as World Rank and keeps that phrase off the best-score card', () => {
    const source = readFileSync(new URL('./RunLineup.tsx', import.meta.url), 'utf8');
    expect(source).toContain('World Rank {formatRank(rank.rank)}');
    const best = source.slice(source.indexOf('export function BestLineup'));
    expect(best).toContain('YOUR BEST');
    expect(best).not.toContain('World Rank');
  });
});