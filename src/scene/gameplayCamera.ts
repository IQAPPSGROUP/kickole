import { Vector3 } from 'three';

/**
 * Gameplay frame shared by the live camera and the opening pan.
 * Lens height/depth and the look-at point sit halfway between the higher
 * main frame (y 1.78, z 7.4, look-at y 0.5, z 1.3) and the lower frame
 * (y 2.38, z 5.7, look-at y 1.22, z -1.1). Field of view stays 40.
 * Portrait phones keep the whole body and the ball above the corner
 * buttons, and the KICKOLÉ mural fully on the brick. A wider aspect
 * only reveals more side wall.
 */
export const GAMEPLAY_TARGET = new Vector3(0, 0.86, 0.1);
export const GAMEPLAY_FOV = 40;

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  void aspect;
  return out.set(0.02, 2.08, 6.55);
}
