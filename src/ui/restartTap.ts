import type { Side } from '../engine/config';
import type { Phase } from '../engine/engine';
import { fanLayout, fanRects, type FanLayout } from './fanLayout';

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

/**
 * A foot-zone tap kicks only while a run is waiting or live.
 * Game over does not store the tap, so Play again leaves the ball on the foot.
 * The button and the zone share this decision, so neither path drops the tap.
 */
export function footTapAction(phase: Phase): 'kick' | 'ignore' {
  switch (phase) {
    case 'ready':
    case 'playing':
      return 'kick';
    case 'menu':
    case 'over':
    case 'dropped':
      return 'ignore';
    default: {
      const unexpected: never = phase;
      return unexpected;
    }
  }
}
