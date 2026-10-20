import { Vector3 } from 'three';

/**
 * Wide / landscape frame. The lens sits at chest height and looks almost
 * level at the back brick, so the wordmark stays on the wall.
 */
const WIDE_POS = new Vector3(0.02, 1.66, 5.4);
const WIDE_LOOK = new Vector3(0, 1.58, -3.2);
const WIDE_FOV = 35;

/**
 * Portrait phones. The head-height lens left the player mid-frame under a
 * tall brick wall, with the ball on the bottom edge. This stance steps back
 * just enough to keep that ball above the trick buttons and aims above the
 * crown so the body sits in the lower half.
 */
const PORTRAIT_POS = new Vector3(0.02, 1.0, 6.6);
const PORTRAIT_LOOK = new Vector3(0, 1.4, -4.5);
const PORTRAIT_FOV = 46;

export function isPortraitFrame(aspect: number): boolean {
  return aspect < 0.9;
}

export function gameplayFov(aspect: number): number {
  return isPortraitFrame(aspect) ? PORTRAIT_FOV : WIDE_FOV;
}

export function gameplayLookAt(aspect: number, out = new Vector3()): Vector3 {
  return out.copy(isPortraitFrame(aspect) ? PORTRAIT_LOOK : WIDE_LOOK);
}

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  return out.copy(isPortraitFrame(aspect) ? PORTRAIT_POS : WIDE_POS);
}

/** Landscape look point. Portrait play uses gameplayLookAt. */
export const GAMEPLAY_TARGET = WIDE_LOOK;
/** Landscape field of view. Portrait play uses gameplayFov. */
export const GAMEPLAY_FOV = WIDE_FOV;
