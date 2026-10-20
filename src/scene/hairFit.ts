import {
  BoxGeometry,
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three';
import type { HairStyle, PlayerBody } from '../game/appearance';

export type Vec3 = [number, number, number];

export type HairBody = PlayerBody | 'primitive';

/** Axis-aligned volume in head-bone space that hair must not enter. */
export interface FaceBox {
  min: Vec3;
  max: Vec3;
}

export interface Skull {
  center: Vector3;
  radius: number;
  /** Top of the scalp in head-bone space. */
  crownY: number;
  face: FaceBox;
  /** Points that must stay outside every hair solid: eyes, nose, brow. */
  landmarks: Record<'leftEye' | 'rightEye' | 'nose' | 'brow', Vector3>;
}

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

/**
 * Head-bone frames measured from the skinned scalp (head weight > 0.5).
 * The female skull sits further forward on the same bone than the male skull.
 */
export const HAIR_SKULLS: Record<HairBody, Skull> = {
  male: {
    center: v(0, 0.1, 0.032),
    radius: 0.086,
    crownY: 0.19,
    face: { min: [-0.06, 0.035, 0.064], max: [0.062, 0.108, 0.15] },
    landmarks: {
      leftEye: v(-0.02, 0.082, 0.11),
      rightEye: v(0.022, 0.08, 0.112),
      nose: v(0.003, 0.05, 0.132),
      brow: v(0, 0.1, 0.118),
    },
  },
  female: {
    center: v(0, 0.125, 0.095),
    radius: 0.08,
    crownY: 0.21,
    face: { min: [-0.05, 0.055, 0.122], max: [0.05, 0.124, 0.19] },
    landmarks: {
      leftEye: v(-0.02, 0.088, 0.136),
      rightEye: v(0.02, 0.088, 0.136),
      nose: v(0, 0.068, 0.168),
      brow: v(0, 0.112, 0.152),
    },
  },
  primitive: {
    center: v(0, 0.01, 0),
    radius: 0.15,
    crownY: 0.16,
    face: { min: [-0.09, -0.02, 0.11], max: [0.09, 0.07, 0.21] },
    landmarks: {
      leftEye: v(-0.06, 0.02, 0.155),
      rightEye: v(0.06, 0.02, 0.155),
      nose: v(0, -0.01, 0.17),
      brow: v(0, 0.05, 0.15),
    },
  },
};

export type HairPart =
  | {
      id: string;
      shape: 'sphere';
      position: Vec3;
      radius: number;
      rotation?: Vec3;
      scale?: Vec3;
      phiStart?: number;
      phiLength?: number;
      thetaStart?: number;
      thetaLength?: number;
    }
  | {
      id: string;
      shape: 'box';
      position: Vec3;
      size: Vec3;
      rotation?: Vec3;
    }
  | {
      id: string;
      shape: 'cylinder';
      position: Vec3;
      radiusTop: number;
      radiusBottom: number;
      height: number;
      rotation?: Vec3;
    }
  | {
      id: string;
      shape: 'cone';
      position: Vec3;
      radius: number;
      height: number;
      rotation?: Vec3;
    };

const point = new Vector3();
const localPoint = new Vector3();
const scaleVec = new Vector3();
const matrix = new Matrix4();
const inverse = new Matrix4();
const quaternion = new Quaternion();
const euler = new Euler();

/** Face opening, in radians, cut out of a sphere around +Z. */
function faceCut(open: number): { phiStart: number; phiLength: number } {
  return { phiStart: Math.PI / 2 + open, phiLength: Math.PI * 2 - open * 2 };
}

function shell(
  skull: Skull,
  opts: { id: string; puff: number; open: number; thetaStart: number; thetaLength: number; lift?: number; back?: number },
): HairPart {
  const cut = faceCut(opts.open);
  return {
    id: opts.id,
    shape: 'sphere',
    position: [
      skull.center.x,
      skull.center.y + (opts.lift ?? skull.radius * 0.06),
      skull.center.z - (opts.back ?? skull.radius * 0.12),
    ],
    radius: skull.radius + opts.puff,
    phiStart: cut.phiStart,
    phiLength: cut.phiLength,
    thetaStart: opts.thetaStart,
    thetaLength: opts.thetaLength,
  };
}

function afro(skull: Skull): HairPart[] {
  // Closed at the crown (theta 0). The old cap started below the pole and left a bald spot.
  return [shell(skull, {
    id: 'afro',
    puff: 0.038,
    open: 1.28,
    thetaStart: 0,
    thetaLength: 2.45,
    lift: 0,
    back: 0,
  })];
}

function mohawk(skull: Skull): HairPart[] {
  const depth = skull.radius * 0.85;
  const height = skull.radius * 1.15;
  return [{
    id: 'mohawk',
    shape: 'box',
    position: [
      skull.center.x,
      skull.crownY + height * 0.28,
      skull.center.z - skull.radius * 0.12,
    ],
    size: [skull.radius * 0.34, height, depth],
  }];
}

function highTop(skull: Skull): HairPart[] {
  const height = skull.radius * 1.2;
  const radius = skull.radius * 0.96;
  const bottom = skull.crownY - skull.radius * 0.22;
  return [{
    id: 'high-top',
    shape: 'cylinder',
    position: [
      skull.center.x,
      bottom + height / 2,
      skull.center.z - skull.radius * 0.04,
    ],
    radiusTop: radius * 0.92,
    radiusBottom: radius,
    height,
  }];
}

function curls(skull: Skull): HairPart[] {
  const cap = shell(skull, {
    id: 'curl-cap',
    puff: 0.02,
    open: 1.28,
    thetaStart: 0,
    thetaLength: 2.05,
    lift: skull.radius * 0.02,
    back: skull.radius * 0.04,
  });
  const curlRadius = Math.min(0.028, skull.radius * 0.28);
  const spots: Array<[number, number, number]> = [
    [0, 1.02, -0.22],
    [-1.28, 0.72, -0.55],
    [1.28, 0.72, -0.55],
    [-1.35, 0.28, -0.72],
    [1.35, 0.28, -0.72],
    [0, 0.48, -1.05],
  ];
  const tufts: HairPart[] = spots.map(([x, y, z], i) => ({
    id: `curl-${i}`,
    shape: 'sphere' as const,
    position: [
      skull.center.x + x * skull.radius,
      skull.center.y + y * skull.radius,
      skull.center.z + z * skull.radius,
    ],
    radius: curlRadius,
  }));
  return [cap, ...tufts];
}

function braids(skull: Skull): HairPart[] {
  const cap = shell(skull, {
    id: 'braid-cap',
    puff: 0.022,
    open: 1.38,
    thetaStart: 0,
    thetaLength: 2.2,
    lift: skull.radius * 0.02,
    back: skull.radius * 0.04,
  });
  const ropes: HairPart[] = [-1, 1].map((side) => {
    const height = 0.22;
    return {
      id: side < 0 ? 'braid-l' : 'braid-r',
      shape: 'cylinder' as const,
      position: [
        skull.center.x + side * skull.radius * 1.22,
        skull.center.y - height * 0.22,
        skull.center.z - skull.radius * 0.12,
      ],
      radiusTop: 0.02,
      radiusBottom: 0.014,
      height,
      rotation: [0.22, 0, side * -0.18],
    };
  });
  return [cap, ...ropes];
}

function spikes(skull: Skull): HairPart[] {
  const cap = shell(skull, {
    id: 'spike-cap',
    puff: 0.016,
    open: 1.42,
    thetaStart: 0,
    thetaLength: 1.9,
    lift: skull.radius * 0.04,
    back: skull.radius * 0.04,
  });
  const spots: Array<[number, number, number]> = [
    [0, 0.01, -0.22],
    [-0.55, 0, -0.42],
    [0.55, 0, -0.42],
    [-0.28, 0.02, -0.12],
    [0.28, 0.02, -0.12],
  ];
  const cones: HairPart[] = spots.map(([x, y, z], i) => {
    const height = skull.radius * 0.62;
    return {
      id: `spike-${i}`,
      shape: 'cone' as const,
      position: [
        skull.center.x + x * skull.radius * 0.7,
        skull.crownY + height / 2 - 0.01 + y,
        skull.center.z + z * skull.radius * 0.55,
      ],
      radius: Math.min(0.018, skull.radius * 0.16),
      height,
      rotation: [z * 0.2, 0, -x * 0.2],
    };
  });
  return [cap, ...cones];
}

function shaved(skull: Skull): HairPart[] {
  const cap = shell(skull, {
    id: 'shaved',
    puff: 0.014,
    open: 1.62,
    thetaStart: 0,
    thetaLength: 1.85,
    lift: skull.radius * 0.12,
    back: skull.radius * 0.04,
  });
  if (cap.shape !== 'sphere') return [cap];
  return [{ ...cap, scale: [1, 0.72, 0.96] }];
}

function shortCap(skull: Skull): HairPart[] {
  return [shell(skull, { id: 'short', puff: 0.02, open: 1.35, thetaStart: 0.05, thetaLength: Math.PI * 0.48, lift: skull.radius * 0.35, back: skull.radius * 0.02 })];
}

/** Procedural hair in head-bone space. Short on a GLB body keeps the authored mesh. */
export function hairParts(style: HairStyle, body: HairBody): HairPart[] {
  const skull = HAIR_SKULLS[body];
  switch (style) {
    case 'bald':
      return [];
    case 'short':
      return body === 'primitive' ? shortCap(skull) : [];
    case 'afro':
      return afro(skull);
    case 'mohawk':
      return mohawk(skull);
    case 'highTop':
      return highTop(skull);
    case 'curls':
      return curls(skull);
    case 'braids':
      return braids(skull);
    case 'spikes':
      return spikes(skull);
    case 'shaved':
      return shaved(skull);
    default: {
      const unknown: never = style;
      return unknown;
    }
  }
}

export function createHairGeometry(part: HairPart): BufferGeometry {
  switch (part.shape) {
    case 'sphere':
      return new SphereGeometry(
        part.radius,
        32,
        22,
        part.phiStart ?? 0,
        part.phiLength ?? Math.PI * 2,
        part.thetaStart ?? 0,
        part.thetaLength ?? Math.PI,
      );
    case 'box':
      return new BoxGeometry(part.size[0], part.size[1], part.size[2]);
    case 'cylinder':
      return new CylinderGeometry(part.radiusTop, part.radiusBottom, part.height, 12);
    case 'cone':
      return new ConeGeometry(part.radius, part.height, 8);
    default: {
      const unknown: never = part;
      return unknown;
    }
  }
}

export function hairMatrix(part: HairPart, target = matrix): Matrix4 {
  const rot = part.rotation ?? [0, 0, 0];
  const scale = part.shape === 'sphere' ? (part.scale ?? [1, 1, 1]) : [1, 1, 1];
  euler.set(rot[0], rot[1], rot[2]);
  quaternion.setFromEuler(euler);
  scaleVec.set(scale[0], scale[1], scale[2]);
  return target.compose(
    point.set(part.position[0], part.position[1], part.position[2]),
    quaternion,
    scaleVec,
  );
}

export function hairSurfacePoints(part: HairPart): Vector3[] {
  const geometry = createHairGeometry(part);
  const position = geometry.getAttribute('position');
  const posed = hairMatrix(part);
  const points: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    points.push(new Vector3().fromBufferAttribute(position, i).applyMatrix4(posed));
  }
  geometry.dispose();
  return points;
}

function phiInside(phi: number, start: number, length: number): boolean {
  let value = phi;
  while (value < start - 1e-4) value += Math.PI * 2;
  while (value > start + Math.PI * 2 - 1e-4) value -= Math.PI * 2;
  return value >= start - 1e-3 && value <= start + length + 1e-3;
}

/** True when the point sits inside the solid hair primitive, in head-bone space. */
export function hairCoversPoint(part: HairPart, world: Vector3): boolean {
  localPoint.copy(world);
  inverse.copy(hairMatrix(part)).invert();
  localPoint.applyMatrix4(inverse);
  const x = localPoint.x;
  const y = localPoint.y;
  const z = localPoint.z;
  switch (part.shape) {
    case 'sphere': {
      const radius = Math.hypot(x, y, z);
      if (radius > part.radius + 1e-4) return false;
      if (radius < 1e-5) return true;
      const theta = Math.acos(Math.min(1, Math.max(-1, y / radius)));
      const thetaStart = part.thetaStart ?? 0;
      const thetaLength = part.thetaLength ?? Math.PI;
      if (theta < thetaStart - 1e-3 || theta > thetaStart + thetaLength + 1e-3) return false;
      const phiStart = part.phiStart ?? 0;
      const phiLength = part.phiLength ?? Math.PI * 2;
      return phiInside(Math.atan2(z, -x), phiStart, phiLength);
    }
    case 'box':
      return Math.abs(x) <= part.size[0] / 2 && Math.abs(y) <= part.size[1] / 2 && Math.abs(z) <= part.size[2] / 2;
    case 'cylinder': {
      const along = y / part.height + 0.5;
      if (along < 0 || along > 1) return false;
      const radius = part.radiusBottom + (part.radiusTop - part.radiusBottom) * along;
      return Math.hypot(x, z) <= radius;
    }
    case 'cone': {
      if (y < -part.height / 2 || y > part.height / 2) return false;
      const fromBase = (part.height / 2 - y) / part.height;
      return Math.hypot(x, z) <= part.radius * fromBase;
    }
    default: {
      const unknown: never = part;
      return unknown;
    }
  }
}

export function pointInFaceBox(p: Vector3, face: FaceBox): boolean {
  return p.x >= face.min[0] && p.x <= face.max[0]
    && p.y >= face.min[1] && p.y <= face.max[1]
    && p.z >= face.min[2] && p.z <= face.max[2];
}

export interface HairSpring {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Largest lag secondaryMotion will write onto the hair group. */
export const HAIR_SPRING_LIMIT: HairSpring = { pitch: 0.14, yaw: 0.2, roll: 0.042 };

/**
 * Surface samples and landmarks that the hair occupies inside the face volume.
 * `spring` is the local lag on the head bone; the skull itself does not rotate.
 */
export function hairFaceHits(style: HairStyle, body: HairBody, spring?: HairSpring): string[] {
  const skull = HAIR_SKULLS[body];
  const hits: string[] = [];
  euler.set(spring?.pitch ?? 0, spring?.yaw ?? 0, spring?.roll ?? 0);
  quaternion.setFromEuler(euler);
  const spin = new Quaternion().copy(quaternion);
  const unwind = spin.clone().invert();
  for (const part of hairParts(style, body)) {
    for (const sample of hairSurfacePoints(part)) {
      sample.applyQuaternion(spin);
      if (pointInFaceBox(sample, skull.face)) hits.push(`${part.id}:surface`);
    }
    for (const [name, landmark] of Object.entries(skull.landmarks)) {
      point.copy(landmark).applyQuaternion(unwind);
      if (hairCoversPoint(part, point)) hits.push(`${part.id}:${name}`);
    }
  }
  return hits;
}

/**
 * Hair that crosses in front of the eyes while still spanning the face width.
 * Samples above the brow are included so a brim cannot hide the eyes.
 */
export function hairEyePlaneHits(style: HairStyle, body: HairBody, spring?: HairSpring): string[] {
  const skull = HAIR_SKULLS[body];
  const eyeZ = Math.min(skull.landmarks.leftEye.z, skull.landmarks.rightEye.z);
  const brow = skull.landmarks.brow;
  const hits: string[] = [];
  euler.set(spring?.pitch ?? 0, spring?.yaw ?? 0, spring?.roll ?? 0);
  quaternion.setFromEuler(euler);
  const spin = new Quaternion().copy(quaternion);
  for (const part of hairParts(style, body)) {
    for (const sample of hairSurfacePoints(part)) {
      sample.applyQuaternion(spin);
      const across = sample.x >= skull.face.min[0] && sample.x <= skull.face.max[0];
      if (!across) continue;
      const overEyes = sample.y <= brow.y + 0.05 && sample.y >= skull.landmarks.nose.y;
      if (overEyes && sample.z > eyeZ - 0.02) hits.push(`${part.id}:eye-plane`);
    }
  }
  return hits;
}

/**
 * Upper-scalp points, outside the face box, that a full head of hair should contain.
 * phi 0 is -X, pi/2 is the face, and 3pi/2 is the back of the head.
 */
export function uncoveredScalp(style: HairStyle, body: HairBody, thetas = [0.12, 0.45]): string[] {
  const skull = HAIR_SKULLS[body];
  const parts = hairParts(style, body);
  const samples: Array<[string, number, number]> = thetas.flatMap((theta) => [
    [`crown-${theta.toFixed(2)}`, theta, Math.PI] as [string, number, number],
    [`back-${theta.toFixed(2)}`, theta, Math.PI * 1.5],
    [`left-${theta.toFixed(2)}`, theta, Math.PI],
    [`right-${theta.toFixed(2)}`, theta, 0],
  ]);
  const missed: string[] = [];
  for (const [name, theta, phi] of samples) {
    const radius = skull.radius * 0.97;
    const probe = skull.center.clone().add(new Vector3(
      -Math.sin(theta) * Math.cos(phi) * radius,
      Math.cos(theta) * radius,
      Math.sin(theta) * Math.sin(phi) * radius,
    ));
    if (pointInFaceBox(probe, skull.face)) continue;
    if (!parts.some((part) => hairCoversPoint(part, probe))) missed.push(name);
  }
  return missed;
}

/** Smallest gap between a hair vertex and the scalp sphere. Negative means the shell is inside the scalp. */
export function hairScalpGap(style: HairStyle, body: HairBody): number {
  const skull = HAIR_SKULLS[body];
  let gap = Number.POSITIVE_INFINITY;
  for (const part of hairParts(style, body)) {
    for (const sample of hairSurfacePoints(part)) {
      gap = Math.min(gap, sample.distanceTo(skull.center) - skull.radius);
    }
  }
  return gap;
}
