import type { TrickKind } from './tricks';

/** Same trick can score this many times in a row. The next repeat scores 0. */
export const TRICK_REPEAT_LIMIT = 10;

export interface TrickRepeatState {
  kind: TrickKind | null;
  /** Successful uses of `kind` since a different trick. */
  count: number;
}

export function emptyTrickRepeat(): TrickRepeatState {
  return { kind: null, count: 0 };
}

/**
 * Pay `points` for a successful trick. The 11th consecutive use of the same
 * kind pays 0 until a different kind starts the count again at 1.
 * A miss never reaches here, so it does not advance the count.
 */
export function scoreTrickRepeat(
  state: TrickRepeatState,
  kind: TrickKind,
  points: number,
): { state: TrickRepeatState; points: number } {
  if (state.kind === kind && state.count >= TRICK_REPEAT_LIMIT) {
    return { state, points: 0 };
  }
  const count = state.kind === kind ? state.count + 1 : 1;
  return { state: { kind, count }, points };
}

/** Uses still paid for the current trick. Full allowance before the first one. */
export function trickRepeatLeft(state: TrickRepeatState): number {
  if (state.kind === null || state.count <= 0) return TRICK_REPEAT_LIMIT;
  return Math.max(0, TRICK_REPEAT_LIMIT - state.count);
}

export function trickRepeatLabel(kind: TrickKind): string {
  switch (kind) {
    case 'header': return 'Header';
    case 'thigh': return 'Thigh kick';
    case 'neckStall': return 'Neck stall';
    case 'aroundTheWorld': return 'Around the world';
    case 'highFlick': return 'High flick';
    case 'groove': return 'Groove';
    default: {
      const unexpected: never = kind;
      return unexpected;
    }
  }
}

export function trickRepeatText(kind: TrickKind, left: number): string {
  return `${trickRepeatLabel(kind)} x${left} left`;
}
