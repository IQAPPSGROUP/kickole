import { PlaneGeometry } from 'three';
import type { Quality } from '../game/storage';

/**
 * Painted futsal markings on the alley concrete.
 * The centre is the freestyle stance. The box runs toward the wire fence
 * (z = -4.14) and stops short of it, so only the near part of the area shows.
 */
export const PITCH_CENTRE = { x: 0, z: 0.2 } as const;
export const PITCH_CIRCLE_RADIUS = 1.28;
export const PITCH_LINE = 0.12;
export const PITCH_SPOT = 0.075;
export const PITCH_HALFWAY = { x0: -2.15, x1: 2.3, z: PITCH_CENTRE.z } as const;
/** Penalty area. No goal line: the fence cuts the box off. */
export const PITCH_BOX = { x0: -1.52, x1: 1.4, front: -1.78, back: -3.7 } as const;
/** Smaller goal area nested in the penalty box, also open at the fence. */
export const PITCH_GOAL = { x0: -0.7, x1: 0.72, front: -2.72, back: -3.7 } as const;

/** Decal extent. Transparent outside the paint, so the quad itself stays unseen. */
export const PITCH_PLANE = { x0: -2.32, x1: 2.48, z0: -3.82, z1: 1.62 } as const;
/** Paint thickness above the concrete. polygonOffset keeps this from z-fighting. */
export const PITCH_Y = 0.003;

const OFFWHITE = { r: 214, g: 206, b: 190 } as const;
const DIRT = { r: 118, g: 110, b: 96 } as const;
const HALF = PITCH_LINE / 2;
const EDGE = 0.015;

/** A few gaps along the paint, in metres. */
const SCUFFS = [
  { x: 0.62, z: PITCH_CENTRE.z, rx: 0.1, rz: 0.035 },
  { x: -0.95, z: PITCH_CENTRE.z, rx: 0.13, rz: 0.04 },
  { x: 0.35, z: PITCH_BOX.front, rx: 0.16, rz: 0.045 },
  { x: PITCH_BOX.x0, z: -2.7, rx: 0.05, rz: 0.18 },
] as const;

export interface PitchSample {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hash(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function coverage(dist: number): number {
  if (dist >= HALF + EDGE) return 0;
  if (dist <= HALF) return 1;
  return (HALF + EDGE - dist) / EDGE;
}

function disc(dist: number, radius: number): number {
  const edge = 0.012;
  if (dist >= radius + edge) return 0;
  if (dist <= radius) return 1;
  return (radius + edge - dist) / edge;
}

function segment(cross: number, along: number, from: number, to: number): number {
  if (along < from || along > to) return 0;
  return coverage(Math.abs(cross));
}

function scuff(x: number, z: number): number {
  let keep = 1;
  for (const hole of SCUFFS) {
    const e = ((x - hole.x) / hole.rx) ** 2 + ((z - hole.z) / hole.rz) ** 2;
    if (e < 1) keep *= e;
  }
  return keep;
}

/** Paint coverage at a world point on the concrete. Alpha 0 is bare concrete. */
export function pitchSample(x: number, z: number): PitchSample {
  const dx = x - PITCH_CENTRE.x;
  const dz = z - PITCH_CENTRE.z;
  const polar = Math.hypot(dx, dz);
  let mask = coverage(Math.abs(polar - PITCH_CIRCLE_RADIUS));
  mask = Math.max(mask, disc(polar, PITCH_SPOT));
  mask = Math.max(mask, segment(z - PITCH_HALFWAY.z, x, PITCH_HALFWAY.x0, PITCH_HALFWAY.x1));
  mask = Math.max(mask, segment(z - PITCH_BOX.front, x, PITCH_BOX.x0, PITCH_BOX.x1));
  mask = Math.max(mask, segment(x - PITCH_BOX.x0, z, PITCH_BOX.back, PITCH_BOX.front));
  mask = Math.max(mask, segment(x - PITCH_BOX.x1, z, PITCH_BOX.back, PITCH_BOX.front));
  mask = Math.max(mask, segment(z - PITCH_GOAL.front, x, PITCH_GOAL.x0, PITCH_GOAL.x1));
  mask = Math.max(mask, segment(x - PITCH_GOAL.x0, z, PITCH_GOAL.back, PITCH_GOAL.front));
  mask = Math.max(mask, segment(x - PITCH_GOAL.x1, z, PITCH_GOAL.back, PITCH_GOAL.front));
  if (mask <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const cell = hash(Math.floor(x * 22), Math.floor(z * 22));
  let wear = scuff(x, z);
  if (cell < 0.045) wear = 0;
  else if (cell < 0.1) wear = Math.min(wear, 0.38);
  const dirt = hash(Math.floor(x * 3.5), Math.floor(z * 3.5));
  const mix = dirt * 0.28;
  const r = Math.round(OFFWHITE.r * (1 - mix) + DIRT.r * mix);
  const g = Math.round(OFFWHITE.g * (1 - mix) + DIRT.g * mix);
  const b = Math.round(OFFWHITE.b * (1 - mix) + DIRT.b * mix);
  return { r, g, b, a: Math.round(mask * wear * 210) };
}

export function pitchTextureSize(quality: Quality): number {
  switch (quality) {
    case 'low':
      return 512;
    case 'medium':
    case 'high':
      return 1024;
    default: {
      const neverQuality: never = quality;
      return neverQuality;
    }
  }
}

/**
 * Image row 0 is the fence end of the decal (min z). That matches a
 * CanvasTexture with flipY, whose top row is uv v = 1, and the plane's
 * v = 1 corner sits on min z.
 */
export function fillPitch(width: number, height: number): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  const { x0, x1, z0, z1 } = PITCH_PLANE;
  for (let y = 0; y < height; y += 1) {
    const z = z0 + ((y + 0.5) / height) * (z1 - z0);
    for (let x = 0; x < width; x += 1) {
      const wx = x0 + ((x + 0.5) / width) * (x1 - x0);
      const sample = pitchSample(wx, z);
      const i = (y * width + x) * 4;
      data[i] = sample.r;
      data[i + 1] = sample.g;
      data[i + 2] = sample.b;
      data[i + 3] = sample.a;
    }
  }
  return data;
}

/** Ground quad. uv (0, 0) is the near-left corner; uv (1, 1) is the far-right. */
export function pitchPlaneGeometry(): PlaneGeometry {
  const { x0, x1, z0, z1 } = PITCH_PLANE;
  const geo = new PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  geo.translate((x0 + x1) / 2, PITCH_Y, (z0 + z1) / 2);
  return geo;
}
