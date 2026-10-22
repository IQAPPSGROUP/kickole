import { useSyncExternalStore } from 'react';
import type { LeaderboardService } from '../game/leaderboard';
import { formatRank } from '../game/leaderboard';

/** How long the pre-run board stays up before the run starts on its own. */
export const RUN_LINEUP_MS = 3000;

/**
 * Top five world names and this player's rank, shown before a run.
 * The card is anchored to the bottom so it stays clear of the alley mural.
 */
export function RunLineup({
  board,
  score,
  onStart,
}: {
  board: LeaderboardService;
  score: number;
  onStart: () => void;
}) {
  const revision = useSyncExternalStore(board.subscribe, () => board.revision);
  void revision;
  const page = board.board('all', 'world', score, 5);
  const rank = board.rankFor(score);
  const rows = page.hidden ? [] : page.rows;
  return (
    <button type="button" className="run-lineup-hit" onClick={onStart}>
      <span className="run-lineup">
        <span className="run-lineup-kicker">WORLD BOARD</span>
        {rows.length === 0 ? (
          <span className="run-lineup-wait">The top five will show when the board answers.</span>
        ) : (
          <ol className="board run-lineup-rows">
            {rows.map((row) => (
              <li key={`${row.rank}:${row.nickname}`} className={row.mine ? 'me' : ''}>
                <span>{row.rank.toLocaleString('en-US')}</span>
                <b>{row.nickname}</b>
              </li>
            ))}
          </ol>
        )}
        <span className="run-lineup-you">
          <span>YOUR RANK</span>
          <b>{formatRank(rank.rank)}</b>
          <em>{board.nickname}</em>
        </span>
        <span className="run-lineup-go">TAP TO START</span>
      </span>
    </button>
  );
}
