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
});