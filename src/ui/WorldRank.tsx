import { useRef, useSyncExternalStore } from 'react';
import { countryByCode } from '../game/countries';
import type { LeaderboardService } from '../game/leaderboard';
import { COUNTRY_BOARD_MIN, formatRank } from '../game/leaderboard';
import { NameFlag } from './NameFlag';

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
  const rank = snapshot.worldHidden ? null : snapshot.rank;
  if (rank != null && (start.current == null || score <= 0)) start.current = rank;
  const gained = rank != null && start.current != null ? Math.max(0, start.current - rank) : 0;
  const country = snapshot.country ? countryByCode(snapshot.country)?.name ?? null : null;
  const waiting = `Leaderboard appears once ${COUNTRY_BOARD_MIN} players have scored`;
  const label = snapshot.worldHidden
    ? waiting
    : [
      `World rank ${formatRank(rank)}`,
      gained > 0 ? `up ${gained}` : null,
      country,
      nickname,
    ].filter((part) => part != null).join(', ');
  return (
    <button type="button" className="world-rank" aria-live="polite" aria-label={label} onClick={onOpen}>
      <p className="world-rank-kicker">WORLD RANK</p>
      <p className={`world-rank-line${rank === 1 ? ' is-first' : ''}`}><b>{formatRank(rank)}</b></p>
      {gained > 0 && <p className="world-rank-delta" key={gained}>↑ +{gained}</p>}
      {!snapshot.worldHidden && <p className="world-rank-name"><NameFlag country={snapshot.country} />{nickname}</p>}
    </button>
  );
}
