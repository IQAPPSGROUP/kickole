import { useRef, useSyncExternalStore } from 'react';
import { countryFlag } from '../game/countries';
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
  void useSyncExternalStore(service.subscribe, () => service.revision);
  const snapshot = service.rankFor(score);
  if (snapshot.rank != null && (start.current == null || score <= 0)) start.current = snapshot.rank;
  const gained = snapshot.rank != null && start.current != null ? Math.max(0, start.current - snapshot.rank) : 0;
  const countryLine = snapshot.country != null && snapshot.countryRank != null
    ? `${snapshot.country} ${formatRank(snapshot.countryRank)}`
    : null;
  const label = [
    `World rank ${formatRank(snapshot.rank)}`,
    countryLine,
    gained > 0 ? `up ${gained}` : null,
    nickname,
  ].filter((part) => part != null).join(', ');
  return (
    <aside className="world-rank" aria-live="polite" aria-label={label}>
      <p className="world-rank-kicker">WORLD RANK</p>
      <p className="world-rank-line"><b>{formatRank(snapshot.rank)}</b></p>
      {countryLine && snapshot.country && (
        <p className="world-rank-country">
          <span className="country-flag" aria-hidden="true">{countryFlag(snapshot.country)}</span>
          {countryLine}
        </p>
      )}
      {gained > 0 && <p className="world-rank-delta" key={gained}>↑ +{gained}</p>}
      <p className="world-rank-name">{nickname}</p>
    </aside>
  );
}
