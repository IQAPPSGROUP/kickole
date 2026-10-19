import { Euler, Quaternion } from 'three';

/**
 * Extra foot pitch at the kick contact frame.
 * Measured on kickole_player_v3: local +X swings the boot mesh back out of the
 * ball. At 0.30 s the sole is only about 3 mm clear; this adds a couple of
 * centimetres so the toe meets the ball instead of sinking into it.
 */
export const KICK_TOE_LIFT = 0.22;

const CONTACT = 0.3;
const WINDOW = 0.1;

const euler = new Euler();

/** Radians of local +X to add. Peaks at the contact frame and eases off. */
export function kickToeClearance(clipTime: number, contactTime = CONTACT): number {
  const dist = Math.abs(clipTime - contactTime);
  if (dist >= WINDOW) return 0;
  return KICK_TOE_LIFT * (1 - dist / WINDOW);
}

export function toeClearanceQuaternion(pitch: number, out: Quaternion): Quaternion {
  euler.set(pitch, 0, 0, 'XYZ');
  return out.setFromEuler(euler);
}
