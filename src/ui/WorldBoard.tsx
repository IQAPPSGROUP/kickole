import { useRef } from 'react';
import { worldBoard } from '../game/board';

/** Compact world board stored on this device. The bright row is you. */
export function WorldBoard({ nickname, score, best, live }: { nickname: string; score: number; best: number; live?: boolean }) {
  const { rows, rank } = worldBoard(nickname, score);
  const anchor = useRef(0);
  const windowSize = Math.min(5, rows.length);
  if (rank < anchor.current) anchor.current = rank;
  if (rank > anchor.current + windowSize - 1) anchor.current = rank - (windowSize - 1);
  anchor.current = Math.max(0, Math.min(anchor.current, rows.length - windowSize));
  const start = live ? anchor.current : Math.max(0, Math.min(rank - 2, rows.length - windowSize));
  const visible = rows.slice(start, start + windowSize);
  return (
    <aside className={live ? 'world-board live' : 'world-board'} aria-label="World board">
      <p>WORLD BOARD</p>
      <ol>
        {visible.map((row) => {
          const place = rows.indexOf(row) - start;
          return (
            <li key={row.you ? 'you' : `${row.country}-${row.nickname}`} className={row.you ? 'you' : ''} style={live ? { top: place * 22 } : undefined}>
              <b>{row.nickname}</b>
              <span>{row.country}</span>
              <em>{row.score}</em>
            </li>
          );
        })}
      </ol>
      <small>ON THIS DEVICE{best > 0 ? ` · BEST ${best}` : ''}</small>
    </aside>
  );
}
