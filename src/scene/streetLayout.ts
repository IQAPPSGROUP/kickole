import type { CourtMaps, CrowdLod, FenceDetail } from './qualityTier';

/** Local, bundled paths. No CDN. BASE_URL is applied at the call site. */
export const STREET_FILES = {
  courtColor: 'textures/street/court_color.ktx2',
  courtNormal: 'textures/street/court_normal.ktx2',
  courtRough: 'textures/street/court_rough.ktx2',
  courtColorLow: 'textures/street/court_color_low.ktx2',
  streetAsphalt: 'textures/street/street_asphalt.ktx2',
  wallColor: 'textures/street/wall_color.ktx2',
  wallNormal: 'textures/street/wall_normal.ktx2',
  wallRough: 'textures/street/wall_rough.ktx2',
  wallColorLow: 'textures/street/wall_color_low.ktx2',
  concreteColor: 'textures/street/concrete_color.ktx2',
  concreteNormal: 'textures/street/concrete_normal.ktx2',
  concreteRough: 'textures/street/concrete_rough.ktx2',
  decalSkid: 'textures/street/decal_skid.ktx2',
  decalStencil: 'textures/street/decal_stencil.ktx2',
  decalTag: 'textures/street/decal_tag.ktx2',
  fenceLod0: 'models/environment/street/fence-lod0.glb',
  fenceLod1: 'models/environment/street/fence-lod1.glb',
  lamp: 'models/environment/street/lamp.glb',
  crowdLod0: 'models/environment/street/crowd-lod0.glb',
  crowdLod1: 'models/environment/street/crowd-lod1.glb',
  crowdLod2: 'models/environment/street/crowd-lod2.glb',
  hdri: 'textures/sunflowers_puresky_1k.hdr',
} as const;

export function streetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export interface MapSet {
  color: string;
  normal: string | null;
  rough: string | null;
}

export function courtMapSet(maps: CourtMaps): MapSet {
  if (maps === 'color') return { color: streetUrl(STREET_FILES.courtColorLow), normal: null, rough: null };
  if (maps === 'rough') return { color: streetUrl(STREET_FILES.courtColor), normal: null, rough: streetUrl(STREET_FILES.courtRough) };
  return {
    color: streetUrl(STREET_FILES.courtColor),
    normal: streetUrl(STREET_FILES.courtNormal),
    rough: streetUrl(STREET_FILES.courtRough),
  };
}

export function wallMapSet(maps: CourtMaps): MapSet {
  if (maps === 'color') return { color: streetUrl(STREET_FILES.wallColorLow), normal: null, rough: null };
  if (maps === 'rough') return { color: streetUrl(STREET_FILES.wallColor), normal: null, rough: streetUrl(STREET_FILES.wallRough) };
  return {
    color: streetUrl(STREET_FILES.wallColor),
    normal: streetUrl(STREET_FILES.wallNormal),
    rough: streetUrl(STREET_FILES.wallRough),
  };
}

export function concreteMapSet(maps: CourtMaps): MapSet {
  if (maps === 'color') return { color: streetUrl(STREET_FILES.concreteColor), normal: null, rough: null };
  if (maps === 'rough') return { color: streetUrl(STREET_FILES.concreteColor), normal: null, rough: streetUrl(STREET_FILES.concreteRough) };
  return {
    color: streetUrl(STREET_FILES.concreteColor),
    normal: streetUrl(STREET_FILES.concreteNormal),
    rough: streetUrl(STREET_FILES.concreteRough),
  };
}

export function fenceModel(detail: FenceDetail): string | null {
  if (detail === 'link') return streetUrl(STREET_FILES.fenceLod0);
  if (detail === 'sparse') return streetUrl(STREET_FILES.fenceLod1);
  return null;
}

export function crowdModel(lod: CrowdLod): string {
  if (lod === 0) return streetUrl(STREET_FILES.crowdLod0);
  if (lod === 1) return streetUrl(STREET_FILES.crowdLod1);
  return streetUrl(STREET_FILES.crowdLod2);
}

export interface Spectator {
  x: number;
  y: number;
  z: number;
  scale: number;
  yaw: number;
  phase: number;
  hat: boolean;
  afro: boolean;
  shirt: string;
  shorts: string;
  skin: string;
  hair: string;
  hatColor: string;
}

const SHIRTS = ['#ff4f9a', '#ffd93d', '#2ee6d6', '#ffffff', '#ff8a3d', '#7c6bff', '#5ee08a', '#ff5a4e'];
const SHORTS = ['#fff6ea', '#1e2a5a', '#ff4f9a', '#2ee6d6', '#ffd93d'];
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3317', '#a56b3c'];
const HAIR = ['#1a120e', '#3b2416', '#6b4423', '#111111', '#8a5a2b', '#cbb59a'];
const HATS = ['#ffd93d', '#ff4f9a', '#2ee6d6', '#ffffff', '#7c6bff'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeSpectator(random: () => number, x: number, z: number, yaw: number): Spectator {
  const hatRoll = random();
  return {
    x,
    y: Math.abs(x) > 4.4 ? 0 : 2.22,
    z,
    scale: 0.92 + random() * 0.2,
    yaw: yaw + (random() - 0.5) * 0.35,
    phase: random() * Math.PI * 2,
    hat: hatRoll > 0.62,
    afro: hatRoll <= 0.62 && hatRoll > 0.38,
    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)] ?? SHIRTS[0],
    shorts: SHORTS[Math.floor(random() * SHORTS.length)] ?? SHORTS[0],
    skin: SKIN[Math.floor(random() * SKIN.length)] ?? SKIN[0],
    hair: HAIR[Math.floor(random() * HAIR.length)] ?? HAIR[0],
    hatColor: HATS[Math.floor(random() * HATS.length)] ?? HATS[0],
  };
}

/**
 * Spectators stand behind the back wall or outside the side walls.
 * The back row is raised so heads clear the wall and read through the fence.
 */
export function crowdPlacements(count: number): Spectator[] {
  const random = mulberry32(1962);
  const spots: Spectator[] = [];
  const safeCount = Math.max(0, Math.floor(count));
  const back = safeCount <= 10 ? safeCount : Math.ceil(safeCount * 0.72);
  const side = safeCount - back;
  for (let i = 0; i < back; i++) {
    const row = i % 2;
    const col = Math.floor(i / 2);
    const cols = Math.ceil(back / 2);
    const u = cols <= 1 ? 0.5 : col / (cols - 1);
    // The phone camera sits to the right, so the visible back wall is negative X.
    const x = -4.35 + u * 3.7 + (row === 1 ? 0.14 : 0);
    const z = row === 0 ? -3.92 : -4.3;
    spots.push(makeSpectator(random, x, z, Math.PI));
  }
  for (let i = 0; i < side; i++) {
    const left = i % 2 === 0;
    const row = Math.floor(i / 2);
    const rows = Math.max(1, Math.ceil(side / 2));
    const u = rows <= 1 ? 0.5 : row / (rows - 1);
    const z = -2.4 + u * 4.2;
    const x = left ? -4.92 : 4.92;
    spots.push(makeSpectator(random, x, z, left ? Math.PI / 2 : -Math.PI / 2));
  }
  return spots;
}

export interface FenceSlot {
  x: number;
  y: number;
  z: number;
  ry: number;
}

/** Chain-link panels. Sparse is the back fence only; link adds the side cages. */
export function fenceSlots(detail: FenceDetail): FenceSlot[] {
  if (detail === 'plane') return [];
  const slots: FenceSlot[] = [];
  for (let i = 0; i < 5; i++) slots.push({ x: -3.6 + i * 1.8, y: 2.6, z: -3.5, ry: 0 });
  if (detail === 'link') {
    for (let i = 0; i < 5; i++) {
      const z = -3.6 + i * 1.8;
      slots.push({ x: -4.4, y: 0.95, z, ry: Math.PI / 2 });
      slots.push({ x: 4.4, y: 0.95, z, ry: -Math.PI / 2 });
    }
  }
  return slots;
}

export function fencePosts(detail: FenceDetail): FenceSlot[] {
  const posts: FenceSlot[] = [];
  for (let i = 0; i < 6; i++) posts.push({ x: -4.5 + i * 1.8, y: 2.6, z: -3.5, ry: 0 });
  if (detail === 'link') {
    for (const x of [-4.4, 4.4]) {
      for (let i = 0; i < 6; i++) posts.push({ x, y: 0.95, z: -4.5 + i * 1.8, ry: 0 });
    }
  }
  return posts;
}

/** True when a point sits in the ball's visual play box. Crowd and lamps must stay out. */
export function inPlayVolume(x: number, z: number): boolean {
  return Math.abs(x) < 2.05 && z > -3.45 && z < 3.3;
}

export interface LampSpot {
  x: number;
  z: number;
  /** Y rotation. 0 points the lamp arm toward +X, into the court from the left. */
  ry: number;
}

/**
 * Two lamps sit on the negative-X wall, which is the side the portrait camera sees.
 * The third stays on the positive-X side for the wide camera.
 */
export const LAMP_SPOTS: readonly LampSpot[] = [
  { x: -3.5, z: -3.18, ry: 0 },
  { x: -2.15, z: -3.18, ry: 0 },
  { x: 3.45, z: -3.18, ry: Math.PI },
];
