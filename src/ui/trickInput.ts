export type TrickRelease = 'fire' | 'locked' | 'ignore';

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
