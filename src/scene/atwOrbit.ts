import type { Side } from '../engine/config';
import type { LegPose } from './pose';

/**
 * Hip-twist orbit measured on kickole_player_v3 so the lower leg stays outside
 * the ball. Left leg uses sign +1; the right leg mirrors abduct and twist.
 * Ball hover that clears the mesh: x = ±0.45, y = 1.00, z = 0.45.
 */
const BASE_THIGH = -0.89;
const AMP_THIGH = 0.55;
const BASE_KNEE = 1.41;
const AMP_KNEE = 0.49;
const BASE_ABD = 0.56;
const AMP_ABD = 0.07;
const BASE_TWIST = 3.65;
const AMP_TWIST = 1.9;
const PHASE = 3.01;
const FOOT_PITCH = 0.25;

export function atwLeg(side: Side, revolution: number): LegPose {
  const sign = side === 'left' ? 1 : -1;
  const ang = revolution * Math.PI * 2;
  return {
    thigh: BASE_THIGH + AMP_THIGH * Math.sin(ang + PHASE),
    knee: BASE_KNEE + AMP_KNEE * Math.cos(ang),
    abduct: sign * (BASE_ABD + AMP_ABD * Math.cos(ang + PHASE)),
    twist: sign * (BASE_TWIST + AMP_TWIST * (ang / (Math.PI * 2))),
    foot: FOOT_PITCH,
    ankleRoll: 0,
    ankleYaw: 0,
  };
}
