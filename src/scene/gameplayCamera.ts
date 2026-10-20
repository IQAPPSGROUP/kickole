import { Vector3 } from 'three';

/**
 * Pulled-back gameplay frame, shared by the live camera and the opening pan.
 * Halfway between the old high overview and the head-height close-up:
 * the lens stays just above the crown, with a gentle downward tilt, so a
 * portrait phone shows the whole player in the middle band and the brick
 * above the fence. A wider aspect only reveals more side wall.
 */
export const GAMEPLAY_TARGET = new Vector3(0, 0.5, 1.3);
export const GAMEPLAY_FOV = 36;

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  void aspect;
  return out.set(0.02, 1.78, 7.4);
}
