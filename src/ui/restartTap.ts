import type { Side } from '../engine/config';
import { fanLayout, fanRects, type FanLayout } from './fanLayout';

export interface CornerTap {
  side: Side;
  at: number;
  pointerId: number;
}

/** Foot button under a screen point, with a little slop so a near miss still counts. */
export function footSideAt(
  x: number,
  y: number,
  width: number,
  height: number,
  layout: FanLayout = fanLayout(width),
): Side | null {
  const rects = fanRects(width, height, layout);
  for (const name of ['left', 'right'] as const) {
    const rect = rects.find((entry) => entry.name === name);
    if (!rect) continue;
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    if (Math.hypot(x - cx, y - cy) <= rect.w / 2 + 6) return name;
  }
  return null;
}

/** A corner tap during game over is still the kick the player meant, if Play again follows quickly. */
export function replayFresh(tap: CornerTap | null, now: number, maxAge = 450): boolean {
  return tap != null && now - tap.at >= 0 && now - tap.at <= maxAge;
}
