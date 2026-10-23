import type { KitPattern } from '../game/kitColours';

export type KitBody = 'male' | 'female';

/** Vertical stripe width on the bind-pose shirt. Hoops are not used. */
export const KIT_STRIPE_PERIOD = 0.12;

/** Bind-pose ranges where thin trim bands sit. Male and female shirts differ in width. */
export const KIT_TRIM_METRICS: Record<KitBody, {
  cuffX: number;
  cuffSpan: number;
  collar0: number;
  collar1: number;
  sockTop: number;
  sockSpan: number;
}> = {
  male: { cuffX: 0.34, cuffSpan: 0.07, collar0: 0.694, collar1: 0.739, sockTop: -0.58, sockSpan: 0.062 },
  female: { cuffX: 0.22, cuffSpan: 0.046, collar0: 0.636, collar1: 0.680, sockTop: -0.6, sockSpan: 0.064 },
};

export const KIT_TRIM_SLOTS = 6;

function frac(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** 1 picks the secondary shirt colour. 0 keeps the main colour. */
export function kitShirtMask(pattern: KitPattern, x: number, _y: number): 0 | 1 {
  switch (pattern) {
    case 'plain':
      return 0;
    case 'stripes':
      return frac(x / KIT_STRIPE_PERIOD + 0.5) >= 0.5 ? 1 : 0;
    default: {
      const neverPattern: never = pattern;
      return neverPattern;
    }
  }
}

/** Which trim band a 0..1 coordinate lands on. The last sliver stays on the final band. */
export function trimBandIndex(count: number, t: number): number {
  const bands = Math.max(1, Math.floor(count));
  const clamped = Math.min(0.999, Math.max(0, t));
  return Math.min(bands - 1, Math.floor(clamped * bands));
}
