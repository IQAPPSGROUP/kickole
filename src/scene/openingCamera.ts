import { Vector3 } from 'three';
import type { EnvironmentTheme } from './environment';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';

/** Smooth scenic reveal before the home screen. */
export const OPENING_DURATION_SEC = 5.5;

type Key = {
  u: number;
  /** World-space camera position. */
  pos: readonly [number, number, number];
  /** Look-at point. */
  target: readonly [number, number, number];
  fov: number;
};

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Keyframes stay in front of the court scenery (positive camera Z, elevated),
 * sweeping landmarks that portrait gameplay framing crops, then settle on the
 * exact gameplay camera. Positions are recomputed from the live aspect so
 * rotation/resize keep the endpoint correct.
 */
function keysFor(theme: EnvironmentTheme, end: Vector3): Key[] {
  const ex = end.x, ey = end.y, ez = end.z;
  const endTarget = [GAMEPLAY_TARGET.x, GAMEPLAY_TARGET.y, GAMEPLAY_TARGET.z] as const;
  if (theme === 'beach') {
    // Palms / kiosk / tower sit behind the court on −Z; stay on the +Z side and look over the wall.
    return [
      { u: 0, pos: [ex + 2.35, ey + 2.05, ez + 0.55], target: [-3.4, 2.55, -9.8], fov: 44 },
      { u: 0.26, pos: [ex + 0.85, ey + 2.4, ez + 1.05], target: [0.2, 2.85, -11.2], fov: 43 },
      { u: 0.52, pos: [ex - 1.75, ey + 1.9, ez + 0.45], target: [3.1, 2.35, -8.6], fov: 42 },
      { u: 0.76, pos: [ex - 0.4, ey + 0.75, ez + 0.18], target: [0.25, 1.6, -2.0], fov: 41 },
      { u: 1, pos: [ex, ey, ez], target: endTarget, fov: GAMEPLAY_FOV },
    ];
  }
  // Street: elevated hillside facade sweep, still facing the pastel fronts.
  return [
    { u: 0, pos: [ex + 2.15, ey + 2.35, ez + 0.5], target: [-2.8, 3.4, -10.2], fov: 44 },
    { u: 0.32, pos: [ex - 0.15, ey + 2.55, ez + 0.95], target: [0.6, 3.7, -11.5], fov: 43 },
    { u: 0.58, pos: [ex - 1.85, ey + 1.75, ez + 0.35], target: [2.4, 2.9, -8.2], fov: 42 },
    { u: 0.8, pos: [ex - 0.3, ey + 0.6, ez + 0.12], target: [0.15, 1.55, -1.6], fov: 41 },
    { u: 1, pos: [ex, ey, ez], target: endTarget, fov: GAMEPLAY_FOV },
  ];
}

const tmpA = new Vector3();
const tmpB = new Vector3();

function lerpKey(a: Key, b: Key, t: number, outPos: Vector3, outTarget: Vector3): number {
  outPos.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * t,
    a.pos[1] + (b.pos[1] - a.pos[1]) * t,
    a.pos[2] + (b.pos[2] - a.pos[2]) * t,
  );
  outTarget.set(
    a.target[0] + (b.target[0] - a.target[0]) * t,
    a.target[1] + (b.target[1] - a.target[1]) * t,
    a.target[2] + (b.target[2] - a.target[2]) * t,
  );
  return a.fov + (b.fov - a.fov) * t;
}

/** Sample the opening path. `u` in 0..1; returns field of view. Guaranteed endpoint matches gameplay framing. */
export function sampleOpeningCamera(
  uRaw: number,
  aspect: number,
  theme: EnvironmentTheme,
  outPos: Vector3,
  outTarget: Vector3,
): number {
  const end = gameplayCameraPosition(aspect, tmpA);
  const keys = keysFor(theme, end);
  const u = easeInOutCubic(Math.min(1, Math.max(0, uRaw)));
  if (u <= 0) {
    outPos.fromArray(keys[0].pos as unknown as number[]);
    outTarget.fromArray(keys[0].target as unknown as number[]);
    return keys[0].fov;
  }
  if (u >= 1) {
    outPos.copy(end);
    outTarget.copy(GAMEPLAY_TARGET);
    return GAMEPLAY_FOV;
  }
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].u < u) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(1e-6, b.u - a.u);
  const t = (u - a.u) / span;
  const fov = lerpKey(a, b, t, outPos, outTarget);
  // Keep a hard guarantee on the final sample even if key math drifts.
  if (uRaw >= 1) {
    outPos.copy(gameplayCameraPosition(aspect, tmpB));
    outTarget.copy(GAMEPLAY_TARGET);
    return GAMEPLAY_FOV;
  }
  return fov;
}
