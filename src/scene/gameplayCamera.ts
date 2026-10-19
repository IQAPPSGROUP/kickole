import { Vector3 } from 'three';

/** Shared gameplay framing — used by the live camera and as the opening pan endpoint. */
export const GAMEPLAY_TARGET = new Vector3(0, 1.25, 0.3);
export const GAMEPLAY_DIR = new Vector3(0.42, 0.38, 0.82).normalize();
export const GAMEPLAY_FOV = 40;

export function gameplayCameraDistance(aspect: number): number {
  const tan = Math.tan((GAMEPLAY_FOV * Math.PI) / 360);
  return Math.max(2.55 / tan, 1.5 / (tan * aspect)) + 0.4;
}

export function gameplayCameraPosition(aspect: number, out = new Vector3()): Vector3 {
  return out.copy(GAMEPLAY_TARGET).addScaledVector(GAMEPLAY_DIR, gameplayCameraDistance(aspect));
}
