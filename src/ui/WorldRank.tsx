import { useRef, useSyncExternalStore } from 'react';
import { countryByCode, countryFlag } from '../game/countries';
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
  const showCountry = snapshot.country != null && snapshot.countryRank != null && !snapshot.countryHidden;
  const countryName = snapshot.country ? countryByCode(snapshot.country)?.name : null;
  const label = [
    `World rank ${formatRank(snapshot.rank)}`,
    showCountry ? `${countryName ?? 'Country'} ${formatRank(snapshot.countryRank)}` : null,
    gained > 0 ? `up ${gained}` : null,
    nickname,
  ].filter((part) => part != null).join(', ');
  return (
    <aside className="world-rank" aria-live="polite" aria-label={label}>
      <p className="world-rank-kicker">WORLD RANK</p>
      <p className={`world-rank-line${snapshot.rank === 1 ? ' is-first' : ''}`}><b>{formatRank(snapshot.rank)}</b></p>
      {showCountry && snapshot.country && (
        <p className="world-rank-country">
          <span className="country-flag" aria-hidden="true">{countryFlag(snapshot.country)}</span>
          {formatRank(snapshot.countryRank)}
        </p>
      )}
      {gained > 0 && <p className="world-rank-delta" key={gained}>↑ +{gained}</p>}
      <p className="world-rank-name">{nickname}</p>
    </aside>
  );
}
