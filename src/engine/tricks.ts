import type { Side } from './config';

/** Playable freestyle tricks. `null` selection keeps classic foot juggling. */
export type TrickKind = 'header' | 'thigh' | 'neckStall' | 'aroundTheWorld' | 'highFlick' | 'groove';

export type TrickPhase = 'prep' | 'contact' | 'execute' | 'recover' | 'fail';

export interface ContactTarget {
  /** Ideal ball-centre height at contact (radius already accounted for in authored values). */
  y: number;
  /** Ideal ball-centre depth at contact. */
  z: number;
  /** Optional lateral centre; omitted means the caller's foot/side offset applies. */
  x?: number;
}

export interface TrickState {
  kind: TrickKind;
  phase: TrickPhase;
  /** Foot used for thigh / ATW / high-flick; null for header and neck. */
  side: Side | null;
  startedAt: number;
  /** True once the trick bonus has been awarded (blocks farming). */
  awarded: boolean;
  /** Around-the-world foot revolution progress (1 = one full turn). */
  revolution: number;
  /** Neck-stall hold timer. */
  held: number;
}

export function createTrickState(kind: TrickKind, side: Side | null, time: number, phase: TrickPhase = 'prep'): TrickState {
  return { kind, phase, side, startedAt: time, awarded: false, revolution: 0, held: 0 };
}

/** Upward speed that reaches `apexY` from `fromY` under the given gravity. */
export function impulseForApex(apexY: number, fromY: number, gravity: number): number {
  const rise = Math.max(0, apexY - fromY);
  return Math.sqrt(2 * Math.max(1e-6, gravity) * rise);
}

/** Seconds until a descending (or still rising) ball centre reaches `height`. */
export function timeToHeight(y: number, vy: number, height: number, gravity: number): number {
  const disc = vy * vy + 2 * gravity * (y - height);
  if (disc < 0) return Infinity;
  return (vy + Math.sqrt(disc)) / gravity;
}

export function nearDepth(z: number, targetZ: number, tol: number): boolean {
  return Math.abs(z - targetZ) <= tol;
}
