import type { Side } from '../engine/config';
import type { LegPose } from './pose';

/**
 * Outside-in foot arc measured on kickole_player_v3.
 * The thigh stays raised and the knee stays bent near a right angle. Abduct,
 * a little twist, and ankle roll carry the foot from outside-behind the ball,
 * around its far side, to the inside-front. The calf stays on the hip side of
 * that arc, so the leg does not pass through the ball.
 * Hover the ball clears while this plays (left side; mirror X for the right):
 * x = -0.76, y = 0.81, z = 0.82.
 */
const KEYS = [
  { t: 0, thigh: -1.62, knee: 0.82, abduct: 1.05, twist: -0.18, foot: 0.32, ankleRoll: 0.2 },
  { t: 0.34, thigh: -1.6, knee: 0.76, abduct: 0.9, twist: -0.22, foot: 0.28, ankleRoll: -0.45 },
  { t: 0.68, thigh: -1.68, knee: 0.76, abduct: 0.55, twist: -0.32, foot: 0.42, ankleRoll: -0.2 },
  { t: 1, thigh: -1.74, knee: 0.86, abduct: 0.36, twist: -0.18, foot: 0.18, ankleRoll: -0.35 },
] as const;

/** Share of the revolution spent popping the ball up before the procedural foot travels. */
export const ATW_POP_PORTION = 0.3;

const ATW_SETUP = 0.12;

export interface AtwFootOffset {
  x: number;
  y: number;
  z: number;
  /** Set-up and catch: the instep meets the ball. The orbit itself stays clear. */
  contact: boolean;
}

/**
 * Outside ATW, right foot anticlockwise from above (mirror with a negative `outward`).
 * The foot starts under the ball, moves to the inside, passes about 10 cm over the top,
 * comes down on the outside, then sweeps back underneath for the catch.
 * Offsets are from the ball centre to the boot surface, in metres.
 */
export function atwFootOffset(revolution: number, outward: number, radius: number): AtwFootOffset {
  const rev = Math.min(1, Math.max(0, revolution));
  const side = outward >= 0 ? 1 : -1;
  if (rev < ATW_SETUP) {
    return { x: 0, y: -(radius + 0.02), z: -0.03, contact: true };
  }
  if (rev > 0.9) {
    return { x: side * 0.02, y: -(radius + 0.02), z: -0.02, contact: rev > 0.94 };
  }
  const span = 0.9 - ATW_SETUP;
  const theta = Math.PI * (1 - (rev - ATW_SETUP) / span);
  return {
    x: side * Math.cos(theta) * 0.2,
    y: Math.sin(theta) * (radius + 0.12) - 0.02,
    z: 0.03 + Math.sin(theta) * 0.04,
    contact: false,
  };
}

export function atwLeg(side: Side, revolution: number): LegPose {
  const sign = side === 'left' ? 1 : -1;
  const circle = Math.min(1, Math.max(0, (revolution - ATW_POP_PORTION) / (1 - ATW_POP_PORTION)));
  let index = 0;
  while (index < KEYS.length - 2 && KEYS[index + 1].t < circle) index += 1;
  const from = KEYS[index];
  const to = KEYS[index + 1];
  const span = to.t - from.t;
  const blend = span <= 0 ? 1 : (circle - from.t) / span;
  const mix = (a: number, b: number) => a + (b - a) * blend;
  return {
    thigh: mix(from.thigh, to.thigh),
    knee: mix(from.knee, to.knee),
    abduct: sign * mix(from.abduct, to.abduct),
    twist: sign * mix(from.twist, to.twist),
    foot: mix(from.foot, to.foot),
    ankleRoll: sign * mix(from.ankleRoll, to.ankleRoll),
    ankleYaw: 0,
  };
}
