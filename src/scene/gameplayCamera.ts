import { Vector3 } from 'three';

/**
 * Gameplay frame shared by the live camera and the opening pan.
 * The lens sits a little above head height and looks slightly down the alley,
 * so a portrait phone puts the feet just above the corner buttons, keeps the
 * whole body and the ball in frame, and leaves the KICKOLÉ mural fully on
 * the brick. A wider aspect only reveals more side wall.
 */
export const GAMEPLAY_TARGET = new Vector3(0, 1.22, -1.1);
export const GAMEPLAY_FOV = 40;

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  void aspect;
  return out.set(0.02, 2.38, 5.7);
}
