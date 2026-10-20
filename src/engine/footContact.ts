import { DEFAULT_CONFIG, type GameConfig, type Side } from './config';
import { normalKickApex } from './tricks';

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
 * The juggle window follows the posed boot. Kick speed is retuned so the apex
 * stays where a kick from the old waist-height contact used to land, which
 * keeps headers reachable once the foot drops to knee height.
 */
export function alignFootWindow(config: GameConfig, left: BallCenter | null, right: BallCenter | null): void {
  const samples = [left, right].filter((sample): sample is BallCenter => sample != null);
  if (samples.length === 0) return;
  const y = samples.reduce((sum, sample) => sum + sample.y, 0) / samples.length;
  const z = samples.reduce((sum, sample) => sum + sample.z, 0) / samples.length;
  const authoredApex = normalKickApex(DEFAULT_CONFIG.contactHeight, DEFAULT_CONFIG.kickSpeed, config.gravity);
  config.contacts.foot = { ...config.contacts.foot, y, z };
  config.contactHeight = y;
  config.ballZ = z;
  const rise = Math.max(0.45, authoredApex - y);
  config.kickSpeed = Math.sqrt(2 * Math.max(0.01, config.gravity) * rise);
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
