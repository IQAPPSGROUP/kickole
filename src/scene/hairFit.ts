import {
  BufferGeometry,
  Euler,
  Matrix4,
  PlaneGeometry,
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

export type HairAtlas = 'strand' | 'braid' | 'curl' | 'spike' | 'stubble' | 'crest';

/** One alpha card. Local +Y runs root to tip, local +Z is the card normal. */
export interface HairCard {
  id: string;
  atlas: HairAtlas;
  position: Vec3;
  rotation: Vec3;
  width: number;
  height: number;
}

export type HairPart = HairCard;

const SEAT = 0.008;
/** A card covers a scalp probe this far from its rectangle. */
const COVER = 0.04;

const UP = new Vector3(0, 1, 0);
const point = new Vector3();
const localPoint = new Vector3();
const scaleVec = new Vector3(1, 1, 1);
const matrix = new Matrix4();
const inverse = new Matrix4();
const quaternion = new Quaternion();
const euler = new Euler();
const sideAxis = new Vector3();
const growthAxis = new Vector3();
const normalAxis = new Vector3();
const rootPoint = new Vector3();

export interface HairSpring {
  pitch: number;
  yaw: number;
  roll: number;
}

/** Largest lag secondaryMotion will write onto the hair group. */
export const HAIR_SPRING_LIMIT: HairSpring = { pitch: 0.14, yaw: 0.2, roll: 0.042 };

const SPRINGS: HairSpring[] = [
  { pitch: 0, yaw: 0, roll: 0 },
  { pitch: HAIR_SPRING_LIMIT.pitch, yaw: HAIR_SPRING_LIMIT.yaw, roll: HAIR_SPRING_LIMIT.roll },
  { pitch: -HAIR_SPRING_LIMIT.pitch, yaw: -HAIR_SPRING_LIMIT.yaw, roll: -HAIR_SPRING_LIMIT.roll },
  { pitch: HAIR_SPRING_LIMIT.pitch, yaw: -HAIR_SPRING_LIMIT.yaw, roll: HAIR_SPRING_LIMIT.roll },
  { pitch: -HAIR_SPRING_LIMIT.pitch, yaw: HAIR_SPRING_LIMIT.yaw, roll: -HAIR_SPRING_LIMIT.roll },
];

export interface ScalpSpec {
  center: Vec3;
  radius: number;
  phiStart: number;
  phiLength: number;
  thetaStart: number;
  thetaLength: number;
  /** Linear RGB, matched to the photographed scalp so the cap hides painted hair. */
  color: Vec3;
}

/** Opaque crown shell. Hides the photograph's painted hair without covering the face. */
export function scalpSpec(body: HairBody): ScalpSpec {
  const skull = HAIR_SKULLS[body];
  const open = 1.08;
  const color: Vec3 = body === 'male'
    ? [0x8b / 255, 0x64 / 255, 0x52 / 255]
    : body === 'female'
      ? [0xa0 / 255, 0x80 / 255, 0x70 / 255]
      : [0xc4 / 255, 0xa4 / 255, 0x84 / 255];
  return {
    center: [skull.center.x, skull.center.y, skull.center.z],
    radius: skull.radius * 1.025,
    phiStart: Math.PI / 2 + open,
    phiLength: Math.PI * 2 - open * 2,
    thetaStart: 0,
    thetaLength: 2.2,
    color,
  };
}

function spherical(theta: number, phi: number, target: Vector3): Vector3 {
  return target.set(
    -Math.sin(theta) * Math.cos(phi),
    Math.cos(theta),
    Math.sin(theta) * Math.sin(phi),
  );
}

function frame(growth: Vector3, align: Vector3, twist: number) {
  growthAxis.copy(growth).normalize();
  normalAxis.copy(align).addScaledVector(growthAxis, -align.dot(growthAxis));
  if (normalAxis.lengthSq() < 1e-8) {
    const ref = Math.abs(growthAxis.y) > 0.92 ? point.set(1, 0, 0) : UP;
    normalAxis.crossVectors(growthAxis, ref);
  }
  normalAxis.normalize();
  sideAxis.crossVectors(growthAxis, normalAxis).normalize();
  const c = Math.cos(twist);
  const s = Math.sin(twist);
  const sx = sideAxis.x * c + normalAxis.x * s;
  const sy = sideAxis.y * c + normalAxis.y * s;
  const sz = sideAxis.z * c + normalAxis.z * s;
  const nx = normalAxis.x * c - sideAxis.x * s;
  const ny = normalAxis.y * c - sideAxis.y * s;
  const nz = normalAxis.z * c - sideAxis.z * s;
  sideAxis.set(sx, sy, sz);
  normalAxis.set(nx, ny, nz);
}

function eulerOf(side: Vector3, growth: Vector3, normal: Vector3): Vec3 {
  matrix.makeBasis(side, growth, normal);
  quaternion.setFromRotationMatrix(matrix);
  euler.setFromQuaternion(quaternion, 'XYZ');
  return [euler.x, euler.y, euler.z];
}

export function pointInFaceBox(p: Vector3, face: FaceBox): boolean {
  return p.x >= face.min[0] && p.x <= face.max[0]
    && p.y >= face.min[1] && p.y <= face.max[1]
    && p.z >= face.min[2] && p.z <= face.max[2];
}

function overEyes(skull: Skull, p: Vector3): boolean {
  const eyeZ = Math.min(skull.landmarks.leftEye.z, skull.landmarks.rightEye.z);
  const across = p.x >= skull.face.min[0] && p.x <= skull.face.max[0];
  if (!across) return false;
  const band = p.y <= skull.landmarks.brow.y + 0.05 && p.y >= skull.landmarks.nose.y;
  return band && p.z > eyeZ - 0.02;
}

export function createHairGeometry(part: HairPart): BufferGeometry {
  return new PlaneGeometry(part.width, part.height, 1, 1);
}

export function hairMatrix(part: HairPart, target = matrix): Matrix4 {
  euler.set(part.rotation[0], part.rotation[1], part.rotation[2], 'XYZ');
  quaternion.setFromEuler(euler);
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

/** True when the point lies on the card or just behind it, against the scalp. */
export function hairCoversPoint(part: HairPart, world: Vector3): boolean {
  localPoint.copy(world);
  inverse.copy(hairMatrix(part)).invert();
  localPoint.applyMatrix4(inverse);
  const dx = Math.abs(localPoint.x) - part.width / 2;
  const dy = Math.abs(localPoint.y) - part.height / 2;
  const dist = Math.hypot(Math.max(dx, 0), Math.max(dy, 0), localPoint.z);
  return dist <= COVER;
}

function springQuaternion(spring: HairSpring, target: Quaternion): Quaternion {
  euler.set(spring.pitch, spring.yaw, spring.roll, 'XYZ');
  return target.setFromEuler(euler);
}

function cardBlocked(skull: Skull, card: HairCard): boolean {
  const samples = hairSurfacePoints(card);
  for (let i = 0; i < 4; i++) samples.push(samples[i].clone().lerp(samples[(i + 1) % 4], 0.5));
  const spin = new Quaternion();
  const unwind = new Quaternion();
  const sample = new Vector3();
  for (const spring of SPRINGS) {
    springQuaternion(spring, spin);
    unwind.copy(spin).invert();
    for (const corner of samples) {
      sample.copy(corner).applyQuaternion(spin);
      if (pointInFaceBox(sample, skull.face) || overEyes(skull, sample)) return true;
    }
    for (const landmark of Object.values(skull.landmarks)) {
      sample.copy(landmark).applyQuaternion(unwind);
      if (hairCoversPoint(card, sample)) return true;
    }
  }
  let buried = 0;
  for (const corner of samples) {
    buried = Math.min(buried, corner.distanceTo(skull.center) - skull.radius);
  }
  return buried < -0.02;
}

function placeAt(
  skull: Skull,
  opts: {
    id: string;
    atlas: HairAtlas;
    root: Vector3;
    growth: Vector3;
    align: Vector3;
    width: number;
    height: number;
    twist?: number;
  },
): HairCard | null {
  frame(opts.growth, opts.align, opts.twist ?? 0);
  const position = rootPoint.copy(opts.root).addScaledVector(growthAxis, opts.height / 2);
  const card: HairCard = {
    id: opts.id,
    atlas: opts.atlas,
    position: [position.x, position.y, position.z],
    rotation: eulerOf(sideAxis, growthAxis, normalAxis),
    width: opts.width,
    height: opts.height,
  };
  if (cardBlocked(skull, card)) return null;
  return card;
}

function add(list: HairCard[], skull: Skull, opts: Parameters<typeof placeAt>[1]) {
  const card = placeAt(skull, opts);
  if (card) list.push(card);
}

function seatRoot(skull: Skull, outward: Vector3, target: Vector3): Vector3 {
  return target.copy(skull.center).addScaledVector(outward, skull.radius + SEAT);
}

function shellCards(
  skull: Skull,
  opts: {
    prefix: string;
    atlas: HairAtlas;
    thetas: number[];
    phiCount: number;
    width: number;
    height: number;
    twists: number[];
    lift: number;
    faceZ: number;
  },
): HairCard[] {
  const cards: HairCard[] = [];
  const outward = new Vector3();
  const growth = new Vector3();
  const root = new Vector3();
  let n = 0;
  for (const theta of opts.thetas) {
    for (let i = 0; i < opts.phiCount; i++) {
      const phi = (i / opts.phiCount) * Math.PI * 2;
      spherical(theta, phi, outward);
      if (outward.z > opts.faceZ && outward.y < 0.72) continue;
      growth.copy(outward).lerp(UP, opts.lift).normalize();
      seatRoot(skull, outward, root);
      for (const twist of opts.twists) {
        add(cards, skull, {
          id: `${opts.prefix}-${n++}`,
          atlas: opts.atlas,
          root,
          growth,
          align: outward,
          width: opts.width,
          height: opts.height,
          twist,
        });
      }
    }
  }
  return cards;
}

function afro(skull: Skull): HairCard[] {
  const height = Math.max(0.052, skull.radius * 0.62);
  const outer = shellCards(skull, {
    prefix: 'afro',
    atlas: 'strand',
    thetas: [0.12, 0.32, 0.52, 0.7, 0.95, 1.18, 1.42, 1.66],
    phiCount: 16,
    width: Math.max(0.028, skull.radius * 0.36),
    height,
    twists: [0, Math.PI / 2],
    lift: 0.12,
    faceZ: 0.38,
  });
  const inner = shellCards(skull, {
    prefix: 'afro-in',
    atlas: 'strand',
    thetas: [0.22, 0.6, 0.95, 1.3],
    phiCount: 12,
    width: Math.max(0.024, skull.radius * 0.3),
    height: height * 0.55,
    twists: [0.6],
    lift: 0.2,
    faceZ: 0.36,
  });
  return [...outer, ...inner];
}

function curls(skull: Skull): HairCard[] {
  return shellCards(skull, {
    prefix: 'curl',
    atlas: 'curl',
    thetas: [0.12, 0.36, 0.6, 0.88, 1.16, 1.42],
    phiCount: 14,
    width: Math.max(0.02, skull.radius * 0.26),
    height: 0.03,
    twists: [0.35, 1.7],
    lift: 0.42,
    faceZ: 0.34,
  });
}

function mohawk(skull: Skull): HairCard[] {
  const cards: HairCard[] = [];
  const outward = new Vector3();
  const growth = new Vector3();
  const root = new Vector3();
  const front = new Vector3(0, 0.15, 1);
  const side = new Vector3(1, 0, 0);
  const steps = 10;
  let n = 0;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    spherical(0.22 + t * 1.15, Math.PI * 1.5, outward);
    seatRoot(skull, outward, root);
    const height = skull.radius * (1.35 - t * 0.4);
    growth.copy(UP).lerp(outward, 0.2).normalize();
    // A narrow strip facing the front, plus layers facing the side.
    add(cards, skull, {
      id: `mohawk-front-${n++}`,
      atlas: 'crest',
      root,
      growth,
      align: front,
      width: 0.028,
      height,
    });
    for (const twist of [-0.45, 0, 0.45]) {
      add(cards, skull, {
        id: `mohawk-side-${n++}`,
        atlas: 'crest',
        root,
        growth,
        align: side,
        width: 0.02,
        height,
        twist,
      });
    }
  }
  return cards;
}

function highTop(skull: Skull): HairCard[] {
  const cards: HairCard[] = [];
  const eyeZ = Math.min(skull.landmarks.leftEye.z, skull.landmarks.rightEye.z);
  const halfW = skull.radius * 0.76;
  const top = skull.crownY + skull.radius * 1.08;
  const frontZ = Math.min(eyeZ - skull.radius * 0.36, skull.center.z + skull.radius * 0.16);
  const depth = skull.radius * 1.2;
  const backZ = frontZ - depth;
  const bottom = Math.max(skull.crownY - skull.radius * 0.02, skull.landmarks.brow.y + 0.07);
  const outward = new Vector3();
  const root = new Vector3();
  let n = 0;
  for (const theta of [0.12, 0.28, 0.38, 0.55]) {
    for (let i = 0; i < 12; i++) {
      spherical(theta, (i / 12) * Math.PI * 2, outward);
      const probe = root.copy(skull.center).addScaledVector(outward, skull.radius);
      if (probe.x < skull.center.x - halfW || probe.x > skull.center.x + halfW) continue;
      if (probe.z < backZ + 0.004 || probe.z > frontZ - 0.004) continue;
      seatRoot(skull, outward, root);
      const height = Math.max(0.03, top - root.y);
      for (const twist of [0, Math.PI / 2]) {
        add(cards, skull, {
          id: `high-${n++}`,
          atlas: 'strand',
          root,
          growth: UP,
          align: outward,
          width: Math.max(0.016, skull.radius * 0.28),
          height,
          twist,
        });
      }
    }
  }
  const cols = 4;
  const rows = 3;
  const wallH = Math.max(0.03, top - bottom);
  for (let ix = 0; ix < cols; ix++) {
    for (let iy = 0; iy < rows; iy++) {
      const x = skull.center.x - halfW + ((ix + 0.5) / cols) * halfW * 2;
      const y0 = bottom + (iy / rows) * wallH;
      const h = wallH / rows + 0.004;
      add(cards, skull, {
        id: `high-front-${n++}`,
        atlas: 'strand',
        root: root.set(x, y0, frontZ),
        growth: UP,
        align: point.set(0, 0, 1),
        width: (halfW * 2) / cols + 0.004,
        height: h,
      });
      add(cards, skull, {
        id: `high-back-${n++}`,
        atlas: 'strand',
        root: root.set(x, y0, backZ),
        growth: UP,
        align: point.set(0, 0, -1),
        width: (halfW * 2) / cols + 0.004,
        height: h,
      });
    }
  }
  for (let iz = 0; iz < cols; iz++) {
    for (let iy = 0; iy < rows; iy++) {
      const z = backZ + ((iz + 0.5) / cols) * depth;
      const y0 = bottom + (iy / rows) * wallH;
      const h = wallH / rows + 0.004;
      add(cards, skull, {
        id: `high-left-${n++}`,
        atlas: 'strand',
        root: root.set(skull.center.x - halfW, y0, z),
        growth: UP,
        align: point.set(-1, 0, 0),
        width: depth / cols + 0.004,
        height: h,
      });
      add(cards, skull, {
        id: `high-right-${n++}`,
        atlas: 'strand',
        root: root.set(skull.center.x + halfW, y0, z),
        growth: UP,
        align: point.set(1, 0, 0),
        width: depth / cols + 0.004,
        height: h,
      });
    }
  }
  const topCols = 5;
  const topRows = 4;
  for (let ix = 0; ix < topCols; ix++) {
    for (let iz = 0; iz < topRows; iz++) {
      const x = skull.center.x - halfW + (ix / topCols) * halfW * 2;
      const z = backZ + (iz / topRows) * depth;
      add(cards, skull, {
        id: `high-top-${n++}`,
        atlas: 'strand',
        root: root.set(x, top, z),
        growth: point.set(0, 0, 1),
        align: UP,
        width: (halfW * 2) / topCols + 0.003,
        height: depth / topRows + 0.003,
      });
    }
  }
  return cards;
}

function braids(skull: Skull): HairCard[] {
  const cards: HairCard[] = [];
  const outward = new Vector3();
  const growth = new Vector3();
  const root = new Vector3();
  const prev = new Vector3();
  let n = 0;
  for (const row of [-2, -1, 0, 1, 2]) {
    const lateral = row * 0.2;
    const steps = 8;
    let hasPrev = false;
    for (let i = 0; i < steps; i++) {
      const theta = 0.3 + (i / (steps - 1)) * 1.28;
      outward.set(lateral, Math.cos(theta), -Math.sin(theta)).normalize();
      seatRoot(skull, outward, root);
      if (hasPrev) growth.copy(root).sub(prev);
      else growth.set(0, Math.sin(theta), -Math.cos(theta));
      if (growth.dot(outward) < 0) growth.addScaledVector(outward, 0.45);
      growth.normalize();
      add(cards, skull, {
        id: `braid-${n++}`,
        atlas: 'braid',
        root,
        growth,
        align: outward,
        width: 0.016,
        height: skull.radius * 0.34,
        twist: i % 2 === 0 ? 0.4 : 0,
      });
      prev.copy(root);
      hasPrev = true;
    }
    outward.set(lateral, Math.cos(1.5), -Math.sin(1.5)).normalize();
    seatRoot(skull, outward, root);
    add(cards, skull, {
      id: `braid-hang-${n++}`,
      atlas: 'braid',
      root,
      growth: growth.set(lateral * 0.35, -1, -0.15).normalize(),
      align: new Vector3(lateral, 0, 1),
      width: 0.018,
      height: 0.2,
    });
  }
  // Box braids beside the cheeks, facing the camera, outside the face volume.
  for (const side of [-1, 1]) {
    for (const [yBias, zBias] of [[0.72, -0.25], [0.35, -0.55]] as const) {
      outward.set(side * 0.95, yBias, zBias).normalize();
      seatRoot(skull, outward, root);
      add(cards, skull, {
        id: `braid-side-${n++}`,
        atlas: 'braid',
        root,
        growth: growth.set(side * 0.12, -1, 0.02).normalize(),
        align: new Vector3(0, 0, 1),
        width: 0.02,
        height: 0.2,
      });
    }
  }
  return cards;
}

function spikes(skull: Skull): HairCard[] {
  const cards = shellCards(skull, {
    prefix: 'spike-bed',
    atlas: 'spike',
    thetas: [0.12, 0.45, 0.75, 1.05],
    phiCount: 10,
    width: Math.max(0.014, skull.radius * 0.16),
    height: 0.02,
    twists: [0.3],
    lift: 0.2,
    faceZ: 0.32,
  });
  const outward = new Vector3();
  const growth = new Vector3();
  const root = new Vector3();
  const spots: Array<[number, number]> = [
    [0.22, Math.PI],
    [0.34, 0],
    [0.4, Math.PI * 1.5],
    [0.48, Math.PI * 0.35],
    [0.48, Math.PI * 0.65],
    [0.62, Math.PI * 1.2],
    [0.62, Math.PI * 1.8],
    [0.78, Math.PI * 1.5],
  ];
  spots.forEach(([theta, phi], index) => {
    spherical(theta, phi, outward);
    if (outward.z > 0.4 && outward.y < 0.7) return;
    growth.copy(outward).lerp(UP, 0.4).normalize();
    seatRoot(skull, outward, root);
    for (const twist of [0, Math.PI / 2]) {
      add(cards, skull, {
        id: `spike-${index}-${twist.toFixed(2)}`,
        atlas: 'spike',
        root,
        growth,
        align: outward,
        width: 0.012,
        height: skull.radius * 0.78,
        twist,
      });
    }
  });
  return cards;
}

function shaved(skull: Skull): HairCard[] {
  return shellCards(skull, {
    prefix: 'stubble',
    atlas: 'stubble',
    thetas: [0.12, 0.4, 0.7, 1.05, 1.35],
    phiCount: 12,
    width: Math.max(0.014, skull.radius * 0.2),
    height: 0.011,
    twists: [0.2],
    lift: 0.05,
    faceZ: 0.28,
  });
}

function shortCap(skull: Skull): HairCard[] {
  return shellCards(skull, {
    prefix: 'short',
    atlas: 'strand',
    thetas: [0.2, 0.55, 0.9],
    phiCount: 10,
    width: skull.radius * 0.22,
    height: 0.02,
    twists: [0.4],
    lift: 0.5,
    faceZ: 0.3,
  });
}

/** Alpha cards in head-bone space. Short on a GLB body keeps the authored mesh. */
export function hairParts(style: HairStyle, body: HairBody): HairCard[] {
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

export function hairFaceHits(style: HairStyle, body: HairBody, spring?: HairSpring): string[] {
  const skull = HAIR_SKULLS[body];
  const hits: string[] = [];
  const spin = springQuaternion(spring ?? { pitch: 0, yaw: 0, roll: 0 }, new Quaternion());
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
  const spin = springQuaternion(spring ?? { pitch: 0, yaw: 0, roll: 0 }, new Quaternion());
  for (const part of hairParts(style, body)) {
    for (const sample of hairSurfacePoints(part)) {
      sample.applyQuaternion(spin);
      const across = sample.x >= skull.face.min[0] && sample.x <= skull.face.max[0];
      if (!across) continue;
      const over = sample.y <= brow.y + 0.05 && sample.y >= skull.landmarks.nose.y;
      if (over && sample.z > eyeZ - 0.02) hits.push(`${part.id}:eye-plane`);
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
  const probe = new Vector3();
  for (const [name, theta, phi] of samples) {
    const radius = skull.radius * 0.97;
    spherical(theta, phi, probe).multiplyScalar(radius).add(skull.center);
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

export function hairBounds(style: HairStyle, body: HairBody): { min: Vector3; max: Vector3 } {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const part of hairParts(style, body)) {
    for (const sample of hairSurfacePoints(part)) {
      min.min(sample);
      max.max(sample);
    }
  }
  return { min, max };
}

export function scalpSurfacePoints(body: HairBody): Vector3[] {
  const spec = scalpSpec(body);
  const geometry = new SphereGeometry(
    spec.radius,
    24,
    16,
    spec.phiStart,
    spec.phiLength,
    spec.thetaStart,
    spec.thetaLength,
  );
  const position = geometry.getAttribute('position');
  const points: Vector3[] = [];
  for (let i = 0; i < position.count; i++) {
    points.push(new Vector3().fromBufferAttribute(position, i).add(new Vector3(...spec.center)));
  }
  geometry.dispose();
  return points;
}
