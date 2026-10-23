import type { KitPattern } from '../game/kitColours';

/** Bind-pose shirt extents on kickole_player_v4. The shader uses the same numbers. */
export const KIT_SLEEVE_X = 0.2;
export const KIT_HOOP_ORIGIN = 0.05;
export const KIT_HOOP_PERIOD = 0.16;
export const KIT_STRIPE_PERIOD = 0.12;
export const KIT_SASH_Y = 0.4;
export const KIT_SASH_SLOPE = 1.5;
export const KIT_SASH_WIDTH = 0.08;
export const KIT_CHEVRON_Y = 0.28;
export const KIT_CHEVRON_SLOPE = 1.1;
export const KIT_CHEVRON_WIDTH = 0.07;

function frac(value: number): number {
  const wrapped = value % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** 1 picks the secondary shirt colour. 0 keeps the main colour. */
export function kitShirtMask(pattern: KitPattern, x: number, y: number): 0 | 1 {
  switch (pattern) {
    case 'plain':
      return 0;
    case 'halves':
      return x >= 0 ? 1 : 0;
    case 'hoops':
      return frac((y - KIT_HOOP_ORIGIN) / KIT_HOOP_PERIOD) >= 0.5 ? 1 : 0;
    case 'sash':
      return Math.abs(y - KIT_SASH_Y + KIT_SASH_SLOPE * x) <= KIT_SASH_WIDTH ? 1 : 0;
    case 'chevron':
      return Math.abs(y - KIT_CHEVRON_Y - KIT_CHEVRON_SLOPE * Math.abs(x)) <= KIT_CHEVRON_WIDTH ? 1 : 0;
    case 'sleeves':
      return Math.abs(x) >= KIT_SLEEVE_X ? 1 : 0;
    case 'stripes':
      return frac(x / KIT_STRIPE_PERIOD + 0.5) >= 0.5 ? 1 : 0;
    default: {
      const neverPattern: never = pattern;
      return neverPattern;
    }
  }
}
