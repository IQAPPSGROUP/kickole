import type { Side } from './config';

/** World-space ball centre. Kept free of three.js so the engine can stay headless. */
export interface BallCenter {
  x: number;
  y: number;
  z: number;
}

/**
 * Ball centre that puts the leather on the posed boot for each kicking side.
 * Null until a character measures its kick clips; tests and the primitive fallback keep the fixed snap.
 */
export const footContactAnchors: Record<Side, BallCenter | null> = { left: null, right: null };

export function setFootContactAnchors(left: BallCenter | null, right: BallCenter | null): void {
  footContactAnchors.left = left;
  footContactAnchors.right = right;
}

export function clearFootContactAnchors(): void {
  footContactAnchors.left = null;
  footContactAnchors.right = null;
}

/**
 * Centre of a ball whose surface touches `boot`, sitting toward `approach` (the old target in front of the foot).
 * Distance from the centre to `boot` is `radius`, so the leather meets that point and does not start inside it.
 */
export function ballOnBoot(boot: BallCenter, approach: BallCenter, radius: number): BallCenter {
  const dx = approach.x - boot.x;
  const dy = approach.y - boot.y;
  const dz = approach.z - boot.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return { x: boot.x, y: boot.y + radius, z: boot.z };
  const scale = radius / len;
  return { x: boot.x + dx * scale, y: boot.y + dy * scale, z: boot.z + dz * scale };
}
