import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Scoreboard } from './Screens';

describe('play chrome copy', () => {
  it('opens a scoreboard that can be closed', () => {
    const html = renderToStaticMarkup(
      Scoreboard({
        best: 40,
        leaderboard: [{ score: 40, kickUps: 8, date: 1 }],
        onClose: () => undefined,
      }),
    );
    expect(html).toContain('SCORES');
    expect(html).toContain('BEST 40');
    expect(html).toContain('>BACK<');
    expect(html).not.toContain('kicks');
  });

  it('says when the board is empty', () => {
    const html = renderToStaticMarkup(
      Scoreboard({ best: 0, leaderboard: [], onClose: () => undefined }),
    );
    expect(html).toContain('NONE YET');
  });
});
