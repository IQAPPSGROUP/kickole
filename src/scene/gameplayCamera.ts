import { Vector3 } from 'three';

/**
 * Head-height gameplay frame, shared by the live camera and the opening pan.
 * The lens sits at chest/head height and looks almost level at the back brick,
 * so a portrait phone shows the wall and the wordmark instead of the concrete.
 */
export const GAMEPLAY_TARGET = new Vector3(0, 1.58, -3.2);
export const GAMEPLAY_FOV = 35;

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  // Vertical field of view already fits the player. A wider aspect only
  // reveals more of the side walls, so the stance does not climb or zoom.
  void aspect;
  return out.set(0.02, 1.66, 5.4);
}
