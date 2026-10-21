import { useRef } from 'react';
import type { LeaderboardService } from '../game/leaderboard';
import { formatRank } from '../game/leaderboard';

/** Broadcast graphic. Places gained are measured from the first score of this visit. */
export function WorldRank({
  score,
  nickname,
  service,
}: {
  score: number;
  nickname: string;
  service: LeaderboardService;
}) {
  const start = useRef<number | null>(null);
  const snapshot = service.rankFor(score);
  if (start.current == null || score <= 0) start.current = snapshot.rank;
  const gained = Math.max(0, start.current - snapshot.rank);
  const label = gained > 0
    ? `World rank ${formatRank(snapshot.rank)}, up ${gained}, ${nickname}`
    : `World rank ${formatRank(snapshot.rank)}, ${nickname}`;
  return (
    <aside className="world-rank" aria-live="polite" aria-label={label}>
      <p className="world-rank-kicker">WORLD RANK</p>
      <p className="world-rank-line"><b>{formatRank(snapshot.rank)}</b></p>
      {gained > 0 && <p className="world-rank-delta" key={gained}>↑ +{gained}</p>}
      <p className="world-rank-name">{nickname}</p>
    </aside>
  );
}
