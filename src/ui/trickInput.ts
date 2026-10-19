export type TrickRelease = 'fire' | 'locked' | 'ignore';

export interface NeckPointerState {
  pointerId: number | null;
}

export type NeckPointerAction = 'press' | 'release' | 'locked' | 'none';

export type NeckPointerEvent = {
  type: 'pointerdown' | 'pointerup' | 'pointercancel' | 'lostpointercapture';
  pointerId: number;
};

/**
 * Neck is a press-and-release. `lostpointercapture` is ignored because a
 * re-render under a held finger drops capture on some phones while the
 * finger is still down. `pointerup` / `pointercancel` end the gesture.
 */
export function applyNeckPointer(
  state: NeckPointerState,
  event: NeckPointerEvent,
  phase: string,
): { state: NeckPointerState; action: NeckPointerAction } {
  switch (event.type) {
    case 'pointerdown':
      if (state.pointerId !== null) return { state, action: 'none' };
      if (phase !== 'playing') return { state: { pointerId: event.pointerId }, action: 'locked' };
      return { state: { pointerId: event.pointerId }, action: 'press' };
    case 'lostpointercapture':
      return { state, action: 'none' };
    case 'pointerup':
    case 'pointercancel':
      if (state.pointerId === null || state.pointerId !== event.pointerId) return { state, action: 'none' };
      return { state: { pointerId: null }, action: 'release' };
    default: {
      const exhaustive: never = event.type;
      return exhaustive;
    }
  }
}

/** Decide a trick-button pointerup. Movement past the slop is a cancelled drag. */
export function classifyTrickRelease(input: {
  phase: string;
  dx: number;
  dy: number;
  slop?: number;
}): TrickRelease {
  const slop = input.slop ?? 28;
  if (Math.hypot(input.dx, input.dy) > slop) return 'ignore';
  if (input.phase !== 'playing') return 'locked';
  return 'fire';
}
