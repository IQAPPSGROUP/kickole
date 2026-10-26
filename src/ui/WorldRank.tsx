import { useRef, useSyncExternalStore } from 'react';
import { countryByCode, countryFlag } from '../game/countries';
import type { LeaderboardService } from '../game/leaderboard';
import { formatRank } from '../game/leaderboard';

/** Broadcast graphic. Places gained are measured from the first score of this visit. */
export function WorldRank({
  score,
  nickname,
  service,
  onOpen,
}: {
  score: number;
  nickname: string;
  service: LeaderboardService;
  onOpen?: () => void;
}) {
  const start = useRef<number | null>(null);
  void useSyncExternalStore(service.subscribe, () => service.revision);
  const snapshot = service.rankFor(score);
  if (snapshot.rank != null && (start.current == null || score <= 0)) start.current = snapshot.rank;
  const gained = snapshot.rank != null && start.current != null ? Math.max(0, start.current - snapshot.rank) : 0;
  const flag = snapshot.country ? countryFlag(snapshot.country) : '';
  const countryName = countryByCode(snapshot.country)?.name ?? null;
  const label = [
    `World rank ${formatRank(snapshot.rank)}`,
    gained > 0 ? `up ${gained}` : null,
    countryName,
    nickname,
  ].filter((part) => part != null).join(', ');
  return (
    <button type="button" className="world-rank" aria-live="polite" aria-label={label} onClick={onOpen}>
      <p className="world-rank-kicker">WORLD RANK</p>
      <p className={`world-rank-line${snapshot.rank === 1 ? ' is-first' : ''}`}><b>{formatRank(snapshot.rank)}</b></p>
      {gained > 0 && <p className="world-rank-delta" key={gained}>↑ +{gained}</p>}
      <p className="world-rank-name">{flag ? <span className="country-flag" aria-hidden="true">{flag}</span> : null}{nickname}</p>
    </button>
  );
}
