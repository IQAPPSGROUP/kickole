import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { BootProfile } from '../game/outfitFit';

/**
 * Closed boot loft in foot-bone space. +Y is up, +Z is toward the toe.
 * Vertices are relative to the mesh centre so the piece lands on the foot
 * bone. The sole is flat and the sides are round, so the silhouette is a
 * boot rather than a box stuck on the ankle.
 */

const AROUND = 16;
const ALONG = 12;

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function toeScale(toe: BootProfile['toe']): number {
  switch (toe) {
    case 'point':
      return 0.14;
    case 'round':
      return 0.36;
    case 'blunt':
      return 0.7;
    default: {
      const unexpected: never = toe;
      throw new Error(`Unexpected boot toe ${String(unexpected)}`);
    }
  }
}

function station(profile: BootProfile, t: number): { hw: number; y0: number; y1: number } {
  const hw0 = profile.halfWidth * (1 + profile.bulk);
  const full = Math.max(0.004, profile.shaftY - profile.soleY);
  let width = 1;
  let height = 1;
  switch (profile.kind) {
    case 'heel': {
      const end = smooth(Math.abs(t - 0.5) * 2);
      width = 1 - 0.42 * end;
      height = 1 - 0.28 * end;
      break;
    }
    case 'cuff': {
      const heel = t < 0.16 ? 0.7 + 0.3 * smooth(t / 0.16) : 1;
      const front = t > 0.62 ? 1 - 0.5 * smooth((t - 0.62) / 0.38) : 1;
      width = heel * front;
      height = t > 0.55 ? 1 - 0.4 * smooth((t - 0.55) / 0.45) : 1;
      break;
    }
    case 'sole': {
      const heel = t < 0.12 ? 0.72 + 0.28 * smooth(t / 0.12) : 1;
      const toeT = profile.toe === 'point' ? 0.42 : profile.toe === 'blunt' ? 0.82 : 0.55;
      const toe = t > 0.62 ? 1 + (toeT - 1) * smooth((t - 0.62) / 0.38) : 1;
      width = heel * toe;
      height = 1;
      break;
    }
    case 'upper': {
      const heel = t < 0.14 ? 0.7 + 0.3 * smooth(t / 0.14) : 1;
      const toe = t > 0.48 ? 1 + (toeScale(profile.toe) - 1) * smooth((t - 0.48) / 0.52) : 1;
      width = heel * toe;
      const toeH = profile.toe === 'point' ? 0.16 : profile.toe === 'blunt' ? 0.38 : 0.26;
      const shaft = t < 0.36 ? 1 : 1 + (toeH - 1) * smooth((t - 0.36) / 0.64);
      const heelRound = t < 0.1 ? 1 - 0.16 * smooth(1 - t / 0.1) : 1;
      height = shaft * heelRound;
      break;
    }
    default: {
      const unexpected: never = profile.kind;
      throw new Error(`Unexpected boot kind ${String(unexpected)}`);
    }
  }
  return {
    hw: hw0 * width,
    y0: profile.soleY,
    y1: profile.soleY + full * height,
  };
}

/** u=0 is the top. The upper keeps a flat sole and a round instep. */
function sectionPoint(u: number, hw: number, y0: number, y1: number, kind: BootProfile['kind']): [number, number] {
  const a = u * Math.PI * 2;
  const sx = Math.sin(a);
  const cy = Math.cos(a);
  const h = Math.max(0.001, y1 - y0);
  if (kind === 'sole' || kind === 'heel') {
    const n = 2.2;
    const ax = Math.sign(sx) * Math.pow(Math.abs(sx), 2 / n);
    const ay = Math.sign(cy) * Math.pow(Math.abs(cy), 2 / n);
    return [ax * hw, (y0 + y1) / 2 + ay * h * 0.5];
  }
  let x = sx * hw;
  if (cy >= 0) return [x, y0 + h * (0.4 + 0.6 * cy)];
  const down = -cy;
  const corner = Math.pow(down, 2.15);
  x *= 1 - 0.1 * corner;
  return [x, y0 + h * 0.4 * (1 - corner)];
}

export function createBootGeometry(profile: BootProfile, center: [number, number, number]): BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings: number[][] = [];

  const push = (x: number, y: number, z: number): number => {
    const index = positions.length / 3;
    positions.push(x - center[0], y - center[1], z - center[2]);
    return index;
  };

  for (let step = 0; step <= ALONG; step += 1) {
    const t = step / ALONG;
    const z = profile.heelZ + (profile.toeZ - profile.heelZ) * t;
    const { hw, y0, y1 } = station(profile, t);
    const ring: number[] = [];
    for (let around = 0; around < AROUND; around += 1) {
      const [x, y] = sectionPoint(around / AROUND, hw, y0, y1, profile.kind);
      ring.push(push(x, y, z));
    }
    rings.push(ring);
  }

  for (let step = 0; step < ALONG; step += 1) {
    const heel = rings[step];
    const toe = rings[step + 1];
    if (!heel || !toe) continue;
    for (let around = 0; around < AROUND; around += 1) {
      const next = (around + 1) % AROUND;
      const i00 = heel[around];
      const i01 = heel[next];
      const i10 = toe[around];
      const i11 = toe[next];
      if (i00 === undefined || i01 === undefined || i10 === undefined || i11 === undefined) continue;
      indices.push(i00, i10, i11, i00, i11, i01);
    }
  }

  const cap = (ring: number[] | undefined, z: number, y0: number, y1: number, outward: number) => {
    if (!ring) return;
    const centerIndex = push(0, (y0 + y1) / 2, z + outward);
    for (let around = 0; around < AROUND; around += 1) {
      const next = (around + 1) % AROUND;
      const a = ring[around];
      const b = ring[next];
      if (a === undefined || b === undefined) continue;
      indices.push(centerIndex, a, b);
    }
  };
  const heelStation = station(profile, 0);
  const toeStation = station(profile, 1);
  const toeDome = profile.toe === 'point' ? 0.012 : profile.toe === 'blunt' ? 0.004 : 0.008;
  cap(rings[0], profile.heelZ, heelStation.y0, heelStation.y1, profile.kind === 'upper' ? -0.006 : -0.003);
  cap(rings[rings.length - 1], profile.toeZ, toeStation.y0, toeStation.y1, profile.kind === 'upper' ? toeDome : 0.003);

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute('normal');
  const position = geometry.getAttribute('position');
  let top = 0;
  let topY = -Infinity;
  const span = profile.toeZ - profile.heelZ;
  for (let i = 0; i < position.count; i += 1) {
    const z = position.getZ(i) + center[2];
    const along = span === 0 ? 0 : (z - profile.heelZ) / span;
    if (along < 0.05 || along > 0.45) continue;
    const y = position.getY(i);
    if (y > topY) {
      topY = y;
      top = i;
    }
  }
  if (normal.getY(top) < 0) {
    const index = geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const swap = index.getX(i + 1);
        index.setX(i + 1, index.getX(i + 2));
        index.setX(i + 2, swap);
      }
      index.needsUpdate = true;
      geometry.computeVertexNormals();
    }
  }
  return geometry;
}
