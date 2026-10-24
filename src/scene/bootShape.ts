import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { BootProfile } from '../game/outfitFit';

/**
 * Closed boot loft in foot-bone space. +Y is up, +Z is toward the toe.
 * Vertices are relative to the mesh centre so the piece lands on the foot
 * bone. The sole is flat and the sides are round, so the silhouette is a
 * boot rather than a box stuck on the ankle.
 */

const AROUND = 20;
const ALONG = 16;

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
      const heel = t < 0.12 ? 0.86 + 0.14 * smooth(t / 0.12) : 1;
      const front = t > 0.88 ? 1 - 0.12 * smooth((t - 0.88) / 0.12) : 1;
      width = heel * front;
      height = 1;
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
      const heel = t < 0.1 ? 0.84 + 0.16 * smooth(t / 0.1) : 1;
      const cut = Math.min(0.86, Math.max(0.12, profile.shaftCut));
      const toe = t > cut ? 1 + (toeScale(profile.toe) - 1) * smooth((t - cut) / (1 - cut)) : 1;
      width = heel * toe;
      const toeH = profile.toe === 'point' ? 0.2 : profile.toe === 'blunt' ? 0.46 : 0.3;
      const drop = t > cut ? smooth((t - cut) / (1 - cut)) : 0;
      height = 1 + (toeH - 1) * drop;
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

/**
 * u=0 is the centre of a flat collar. The rim stays on one height so the
 * opening does not serrate, then a quarter-ellipse falls to a flat sole.
 */
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
  const right = u <= 0.5 ? u : 1 - u;
  const sign = u <= 0.5 ? 1 : -1;
  const topW = hw * 0.62;
  let x: number;
  let y: number;
  if (right < 0.11) {
    x = topW * (right / 0.11);
    y = y1;
  } else if (right < 0.36) {
    const s = (right - 0.11) / 0.25;
    const ang = s * Math.PI * 0.5;
    x = topW + (hw - topW) * Math.sin(ang);
    y = y0 + h * Math.cos(ang);
  } else {
    const s = (right - 0.36) / 0.14;
    x = hw * (1 - s);
    y = y0;
  }
  return [sign * x, y];
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
