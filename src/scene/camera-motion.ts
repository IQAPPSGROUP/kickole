import type { Side } from '../engine/config';
import type { Quality } from '../game/storage';

export interface CameraKick {
  /** Dolly toward the player, 0..1. */
  push: number;
  /** High-frequency shake, 0..1. Zero on Low. */
  shake: number;
  /** Slow orbit and rise, 0..1. */
  celebrate: number;
  /** Signed lean, about -1..1, toward the kicking foot. */
  sway: number;
}

/** How a scored kick should move the camera. Rendering only; it does not affect the ball. */
export function cameraKickFor(
  event: { grade: 'perfect' | 'good' | 'poor'; stall: boolean; alternate: boolean; streak: number; side: Side },
  quality: Quality,
): CameraKick {
  const perfect = event.grade === 'perfect';
  const milestone = event.streak > 0 && event.streak % 10 === 0;
  const dir = event.side === 'left' ? -1 : 1;
  return {
    push: perfect ? 1 : event.stall ? 0.8 : 0.42,
    shake: quality === 'low' ? 0 : perfect ? (milestone ? 1 : 0.75) : event.stall ? 0.4 : 0.18,
    celebrate: perfect ? (milestone && quality !== 'low' ? 1 : 0.72) : event.stall ? 0.55 : event.alternate ? 0.3 : 0,
    sway: dir * (perfect || event.alternate ? 1 : 0.35),
  };
}

/** Orbit, rise and extra dolly for the current celebration amount. */
export function celebrateOffset(celebrate: number, elapsed: number, quality: Quality): { yaw: number; lift: number; dolly: number } {
  const amp = quality === 'high' ? 0.22 : quality === 'medium' ? 0.12 : 0.055;
  return {
    yaw: Math.sin(elapsed * 1.6) * celebrate * amp,
    lift: celebrate * (quality === 'low' ? 0.08 : 0.2),
    dolly: celebrate * (quality === 'low' ? 0.04 : 0.1),
  };
}
