import type { PlayerBody } from './appearance';
import { getBootStyle, type BootStyleId } from './bootStyles';
import { OUTFIT_IDS, type OutfitId } from './outfits';

/**
 * Bone-local accessory placement measured on the idle pose of both v4 bodies.
 * +Y is up, +Z is forward, +X is the body's right.
 * Female values are the female mesh, not a scaled copy of the male one.
 * Pieces sit on the surface. They do not add chest, hip, or leg volume.
 */

export type FitBone = 'head' | 'spine2' | 'neck' | 'armL' | 'armR' | 'footL' | 'footR';
export type AccessorySlot = 'crown' | 'band' | 'face' | 'chest' | 'back' | 'cape' | 'arm' | 'neck' | 'foot';
export type AccessoryShape = 'box' | 'sphere' | 'cone' | 'boot';

/** Rounded boot loft in foot-bone space. +Y is up, +Z is toward the toe. */
export interface BootProfile {
  halfWidth: number;
  soleY: number;
  shaftY: number;
  heelZ: number;
  toeZ: number;
  heelDrop: number;
  toe: 'round' | 'point' | 'blunt';
  bulk: number;
  kind: 'upper' | 'sole' | 'cuff' | 'heel';
}

export interface BodyMeasures {
  hairTop: number;
  headHalf: number;
  headBack: number;
  browY: number;
  faceZ: number;
  chestFront: number;
  chestBack: number;
  chestHalf: number;
  footToe: number;
  footHeel: number;
  footHalf: number;
  footSole: number;
  footAnkle: number;
  footX: number;
}

/** Idle-pose surfaces sampled from the skinned heads, chests, and boots. */
export const BODY_MEASURES: Record<PlayerBody, BodyMeasures> = {
  male: {
    hairTop: 0.191,
    headHalf: 0.084,
    headBack: -0.075,
    browY: 0.07,
    faceZ: 0.137,
    chestFront: 0.164,
    chestBack: -0.11,
    chestHalf: 0.16,
    footToe: 0.167,
    footHeel: -0.056,
    footHalf: 0.044,
    footSole: -0.081,
    footAnkle: 0.025,
    footX: 0.003,
  },
  female: {
    hairTop: 0.223,
    headHalf: 0.089,
    headBack: -0.115,
    browY: 0.075,
    faceZ: 0.176,
    chestFront: 0.171,
    chestBack: -0.151,
    chestHalf: 0.14,
    footToe: 0.182,
    footHeel: -0.046,
    footHalf: 0.055,
    footSole: -0.073,
    footAnkle: 0.053,
    footX: -0.008,
  },
};

export interface MeshSpec {
  bone: FitBone;
  slot: AccessorySlot;
  shape: AccessoryShape;
  name: string;
  position: [number, number, number];
  size: [number, number, number];
  rotation?: [number, number, number];
  color: string;
  roughness?: number;
  metalness?: number;
  boot?: BootProfile;
}

export const FIT_BONE_NAME: Record<FitBone, string> = {
  head: 'Head',
  spine2: 'Spine2',
  neck: 'Neck',
  armL: 'LowerArm_L',
  armR: 'LowerArm_R',
  footL: 'Foot_L',
  footR: 'Foot_R',
};

function box(
  bone: FitBone,
  slot: AccessorySlot,
  name: string,
  position: [number, number, number],
  size: [number, number, number],
  color: string,
  roughness = 0.55,
  metalness = 0.04,
  rotation?: [number, number, number],
): MeshSpec {
  return { bone, slot, shape: 'box', name, position, size, color, roughness, metalness, rotation };
}

function sphere(
  bone: FitBone,
  slot: AccessorySlot,
  name: string,
  position: [number, number, number],
  radius: number,
  color: string,
): MeshSpec {
  return { bone, slot, shape: 'sphere', name, position, size: [radius, radius, radius], color, roughness: 0.45 };
}

function measuresOf(body: PlayerBody): BodyMeasures {
  return BODY_MEASURES[body];
}

function headband(m: BodyMeasures, color: string, name: string): MeshSpec[] {
  const y = m.browY + (m.hairTop - m.browY) * 0.45;
  const frontZ = m.faceZ - 0.04;
  const sideX = m.headHalf + 0.012;
  const backZ = m.headBack + 0.012;
  const t = 0.012;
  return [
    box('head', 'band', `${name}-front`, [0, y, frontZ], [m.headHalf * 1.5, t, t], color),
    box('head', 'band', `${name}-back`, [0, y, backZ], [m.headHalf * 1.5, t, t], color),
    box('head', 'band', `${name}-left`, [-sideX, y, 0], [t, t, Math.abs(frontZ - backZ) * 0.7], color),
    box('head', 'band', `${name}-right`, [sideX, y, 0], [t, t, Math.abs(frontZ - backZ) * 0.7], color),
  ];
}

function antennae(m: BodyMeasures): MeshSpec[] {
  const y = m.hairTop + 0.055;
  const x = m.headHalf * 0.45;
  return [
    box('head', 'crown', 'antenna-stalk-l', [-x, y, 0.01], [0.008, 0.1, 0.008], '#D7E0C8'),
    box('head', 'crown', 'antenna-stalk-r', [x, y, 0.01], [0.008, 0.1, 0.008], '#D7E0C8'),
    sphere('head', 'crown', 'antenna-tip-l', [-x, y + 0.06, 0.01], 0.016, '#E7F27A'),
    sphere('head', 'crown', 'antenna-tip-r', [x, y + 0.06, 0.01], 0.016, '#E7F27A'),
  ];
}

function cape(m: BodyMeasures, color: string, name: string): MeshSpec {
  const width = m.chestHalf * 1.7;
  return box('spine2', 'cape', name, [0, -0.08, m.chestBack - 0.01], [width, 0.4, 0.012], color, 0.6);
}

function backpack(m: BodyMeasures, color: string): MeshSpec {
  return box('spine2', 'back', 'backpack', [0, 0.04, m.chestBack - 0.045], [m.chestHalf * 0.85, 0.16, 0.07], color, 0.5);
}

function moustache(m: BodyMeasures, scale: number): MeshSpec {
  return box('head', 'face', 'moustache', [0, 0.02, m.faceZ + 0.008], [m.headHalf * scale, 0.02, 0.012], '#3A2A22', 0.7);
}

function beard(m: BodyMeasures, scale: number): MeshSpec {
  const height = 0.07 * scale;
  return box('head', 'face', 'beard', [0, -0.015, m.faceZ + 0.006], [m.headHalf * 1.15 * scale, height, 0.02], '#F4F1EA', 0.8);
}

function armTape(color: string): MeshSpec[] {
  const size: [number, number, number] = [0.05, 0.028, 0.05];
  return [
    box('armL', 'arm', 'tape-l', [0, -0.08, 0], size, color, 0.7),
    box('armR', 'arm', 'tape-r', [0, -0.08, 0], size, color, 0.7),
  ];
}

function mirrorFoot(spec: MeshSpec): MeshSpec {
  return {
    ...spec,
    bone: 'footR',
    name: `${spec.name}-r`,
    position: [-spec.position[0], spec.position[1], spec.position[2]],
  };
}

function pairFeet(left: MeshSpec[]): MeshSpec[] {
  return [...left, ...left.map(mirrorFoot)];
}

interface BootFit {
  halfWidth: number;
  soleY: number;
  shaftY: number;
  heelZ: number;
  toeZ: number;
  heelDrop: number;
  toe: BootProfile['toe'];
  bulk: number;
  soleThick: number;
  cuff: number;
}

function bootPiece(
  name: string,
  footX: number,
  color: string,
  roughness: number,
  metalness: number,
  kind: BootProfile['kind'],
  fit: BootFit,
): MeshSpec {
  const drop = kind === 'heel' ? fit.heelDrop : 0;
  const soleDrop = kind === 'sole' ? fit.soleThick * 0.65 : 0;
  const shaftY = kind === 'sole' ? fit.soleY + fit.soleThick * 0.4 : fit.shaftY;
  const soleY = kind === 'heel' ? fit.soleY - fit.heelDrop : fit.soleY - soleDrop;
  const top = kind === 'heel' ? fit.soleY : shaftY;
  const bottom = kind === 'cuff' ? fit.shaftY - fit.cuff : soleY;
  const heelZ = fit.heelZ;
  const toeZ = kind === 'heel' ? fit.heelZ + 0.046 : kind === 'cuff' ? fit.heelZ + (fit.toeZ - fit.heelZ) * 0.7 : fit.toeZ;
  const profile: BootProfile = {
    halfWidth: fit.halfWidth,
    soleY: kind === 'cuff' ? bottom : soleY,
    shaftY: top,
    heelZ,
    toeZ,
    heelDrop: drop,
    toe: kind === 'heel' || kind === 'cuff' ? 'round' : fit.toe,
    bulk: kind === 'sole' ? fit.bulk + 0.06 : kind === 'cuff' ? fit.bulk + 0.08 : fit.bulk,
    kind,
  };
  const high = profile.shaftY;
  const low = profile.soleY - (kind === 'heel' ? 0 : profile.heelDrop);
  return {
    bone: 'footL',
    slot: 'foot',
    shape: 'boot',
    name,
    position: [footX, (high + low) / 2, (profile.heelZ + profile.toeZ) / 2],
    size: [profile.halfWidth * 2 * (1 + profile.bulk), high - low, profile.toeZ - profile.heelZ],
    color,
    roughness,
    metalness,
    boot: profile,
  };
}

/**
 * Rounded boots on the foot bones. Names stay off the contact materials, so
 * the ball still meets the skinned boot. The shell covers that boot without
 * climbing to the knee.
 */
export function bootStyleSpecs(id: BootStyleId, body: PlayerBody): MeshSpec[] {
  if (id === 'boot-classic') return [];
  const style = getBootStyle(id);
  const m = measuresOf(body);
  const fit = bootFit(id, m);
  const metal = id === 'boot-gold' ? 0.62 : id === 'boot-knight' ? 0.32 : id === 'boot-space' ? 0.2 : 0.08;
  const rough = id === 'boot-gold' ? 0.32 : 0.48;
  const prefix = bootPrefix(id);
  const upper = bootPiece(`${prefix}-shaft`, m.footX, style.main, rough, metal, 'upper', fit);
  const sole = bootPiece(`${prefix}-sole`, m.footX, style.dark, 0.7, 0.04, 'sole', fit);
  const left: MeshSpec[] = id === 'boot-cowboy'
    ? [
      upper,
      bootPiece('cowboy-toe', m.footX, style.main, rough, metal, 'upper', {
        ...fit,
        heelZ: m.footToe - 0.02,
        toeZ: m.footToe + 0.03,
        shaftY: m.footSole + 0.05,
        toe: 'point',
        bulk: -0.08,
      }),
      bootPiece('cowboy-heel', m.footX, style.dark, 0.72, 0.02, 'heel', fit),
      sole,
    ]
    : [upper, sole];
  if (id === 'boot-snow') {
    left.push(bootPiece('snow-cuff', m.footX, style.light, 0.62, 0.02, 'cuff', fit));
  }
  if (id === 'boot-wellies') {
    left.push(bootPiece('wellie-cuff', m.footX, style.dark, 0.55, 0.04, 'cuff', { ...fit, cuff: 0.012 }));
  }
  return pairFeet(left);
}

function bootPrefix(id: BootStyleId): string {
  switch (id) {
    case 'boot-classic': return 'classic';
    case 'boot-wellies': return 'wellie';
    case 'boot-cowboy': return 'cowboy';
    case 'boot-hitops': return 'hitop';
    case 'boot-snow': return 'snow';
    case 'boot-space': return 'space';
    case 'boot-knight': return 'knight';
    case 'boot-gold': return 'gold';
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

function bootFit(id: BootStyleId, m: BodyMeasures): BootFit {
  const base: BootFit = {
    halfWidth: m.footHalf * 1.1,
    soleY: m.footSole + 0.006,
    shaftY: m.footAnkle + 0.012,
    heelZ: m.footHeel - 0.006,
    toeZ: m.footToe + 0.014,
    heelDrop: 0,
    toe: 'round',
    bulk: 0,
    soleThick: 0.012,
    cuff: 0.016,
  };
  switch (id) {
    case 'boot-classic':
      return base;
    case 'boot-wellies':
      return { ...base, shaftY: m.footAnkle + 0.105, toe: 'round', soleThick: 0.014 };
    case 'boot-cowboy':
      return { ...base, shaftY: m.footAnkle + 0.012, toeZ: m.footToe + 0.004, toe: 'point', heelDrop: 0.022, halfWidth: m.footHalf * 0.96 };
    case 'boot-hitops':
      return { ...base, shaftY: m.footAnkle + 0.05, soleThick: 0.022, toe: 'round' };
    case 'boot-snow':
      return { ...base, shaftY: m.footAnkle + 0.04, cuff: 0.02, toe: 'round' };
    case 'boot-space':
      return { ...base, shaftY: m.footAnkle + 0.045, bulk: 0.28, toe: 'blunt', soleThick: 0.016 };
    case 'boot-knight':
      return { ...base, shaftY: m.footAnkle + 0.078, toe: 'blunt' };
    case 'boot-gold':
      return { ...base, shaftY: m.footAnkle + 0.014, toe: 'round' };
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

export function cowboyBootSpecs(body: PlayerBody): MeshSpec[] {
  return bootStyleSpecs('boot-cowboy', body);
}

/** Original bars and dots. Not a cross, eagle, animal, or a known wrestler's mask. */
function luchaMask(m: BodyMeasures): MeshSpec[] {
  const z = m.faceZ + 0.008;
  return [
    box('head', 'face', 'lucha-brow', [0, m.browY + 0.018, z], [m.headHalf * 1.15, 0.018, 0.01], '#1F8A8A'),
    box('head', 'face', 'lucha-dot-l', [-m.headHalf * 0.36, m.browY - 0.028, z], [0.018, 0.018, 0.01], '#F26B5B'),
    box('head', 'face', 'lucha-dot-r', [m.headHalf * 0.36, m.browY - 0.028, z], [0.018, 0.018, 0.01], '#F26B5B'),
  ];
}

export function outfitSpecs(id: OutfitId, body: PlayerBody): MeshSpec[] {
  const m = measuresOf(body);
  const beardScale = body === 'female' ? 0.84 : 1;
  switch (id) {
    case 'alien':
      return [...headband(m, '#214C32', 'alien-band'), ...antennae(m)];
    case 'spaceman':
      return [
        ...headband(m, '#D5DDE3', 'helmet-ring'),
        box('head', 'band', 'visor-up', [0, m.hairTop - 0.02, m.faceZ - 0.05], [m.headHalf * 1.2, 0.012, 0.05], '#9FD7E8', 0.2, 0.15, [-0.9, 0, 0]),
        backpack(m, '#F4F7F8'),
      ];
    case 'street-hero':
      return [...armTape('#F26B5B'), ...headband(m, '#1F8A8A', 'hero-band')];
    case 'night-glider':
      return [...armTape('#8B939C'), ...headband(m, '#3A3F45', 'glider-band')];
    case 'secret-agent':
      return [
        box('head', 'face', 'agent-glasses', [0, m.browY, m.faceZ + 0.008], [m.headHalf * 1.35, 0.016, 0.01], '#1A1A1A', 0.3, 0.35),
        box('neck', 'neck', 'agent-tie', [0, -0.01, 0.03], [0.016, 0.05, 0.012], '#6B1D1D', 0.55),
      ];
    case 'night-wrap':
      return [...headband(m, '#C0392B', 'ninja-band'), ...armTape('#1A1A1A')];
    case 'deck-hand':
      return [
        ...headband(m, '#F4F1EA', 'bandana'),
        box('head', 'face', 'eyepatch', [m.headHalf * 0.32, m.browY, m.faceZ + 0.008], [0.034, 0.028, 0.01], '#1A1A1A'),
        box('spine2', 'chest', 'waistcoat', [0, 0.02, m.chestFront + 0.008], [m.chestHalf * 1.15, 0.2, 0.012], '#6B1D1D', 0.6),
      ];
    case 'grey-ghoul':
      return [
        box('head', 'band', 'head-bandage', [0, m.browY + 0.015, m.faceZ - 0.045], [m.headHalf * 1.4, 0.02, 0.012], '#F4F1EA', 0.8),
        ...armTape('#F7F5ED'),
      ];
    case 'keep-guard':
      return [
        box('spine2', 'chest', 'tabard', [0, 0.0, m.chestFront + 0.008], [m.chestHalf * 1.05, 0.24, 0.012], '#7A1F2B', 0.65),
        box('spine2', 'chest', 'crest', [0, 0.06, m.chestFront + 0.016], [0.05, 0.06, 0.008], '#E7D3A1', 0.5),
      ];
    case 'kitchen-whites':
      return [
        box('head', 'crown', 'chef-hat', [0, m.hairTop + 0.07, 0], [m.headHalf * 1.15, 0.12, m.headHalf * 1.15], '#F7F5ED', 0.75),
        box('spine2', 'chest', 'apron', [0, -0.02, m.chestFront + 0.01], [m.chestHalf * 1.1, 0.22, 0.012], '#E7E2D6', 0.7),
      ];
    case 'spike-hood':
      return [
        box('head', 'crown', 'hood', [0, m.hairTop - 0.01, m.headBack * 0.25], [m.headHalf * 1.8, 0.08, m.headHalf * 1.6], '#3E7D4F', 0.65),
        box('head', 'crown', 'spike-a', [0, m.hairTop + 0.06, 0], [0.018, 0.07, 0.018], '#E7A317'),
        box('head', 'crown', 'spike-b', [-m.headHalf * 0.45, m.hairTop + 0.035, 0], [0.014, 0.05, 0.014], '#E7A317'),
        box('head', 'crown', 'spike-c', [m.headHalf * 0.45, m.hairTop + 0.035, 0], [0.014, 0.05, 0.014], '#E7A317'),
      ];
    case 'stage-jacket':
      return [
        box('head', 'face', 'shades', [0, m.browY, m.faceZ + 0.008], [m.headHalf * 1.45, 0.02, 0.01], '#1A1A1A', 0.25, 0.4),
        box('head', 'crown', 'quiff', [0, m.hairTop - 0.005, m.faceZ * 0.28], [m.headHalf * 0.7, 0.045, 0.04], '#2A211C', 0.6),
      ];
    case 'ring-mask':
      return [...luchaMask(m), cape(m, '#E23B4A', 'lucha-cape')];
    case 'match-official':
      return [
        box('spine2', 'chest', 'whistle', [0.04, 0.1, m.chestFront + 0.012], [0.02, 0.016, 0.012], '#C0C4C8', 0.35, 0.4),
        box('spine2', 'chest', 'card-yellow', [-0.034, 0.02, m.chestFront + 0.012], [0.016, 0.026, 0.006], '#F2C14E', 0.55),
        box('spine2', 'chest', 'card-red', [-0.016, 0.016, m.chestFront + 0.016], [0.016, 0.026, 0.006], '#E23B4A', 0.55),
      ];
    case 'seventies':
      return [
        ...headband(m, '#F2C14E', 'sweatband'),
        moustache(m, beardScale),
      ];
    case 'north-pole':
      return [
        box('head', 'crown', 'santa-hat', [0, m.hairTop + 0.05, -0.01], [m.headHalf * 1.2, 0.1, m.headHalf], '#B4232A', 0.65),
        sphere('head', 'crown', 'hat-pom', [0, m.hairTop + 0.11, -0.01], 0.02, '#F7F5ED'),
        beard(m, beardScale),
      ];
    case 'snow-friend':
      return [
        box('neck', 'neck', 'scarf', [0, 0, 0.02], [m.headHalf * 1.7, 0.028, 0.06], '#E24B4B', 0.7),
        box('spine2', 'chest', 'button-a', [0, 0.1, m.chestFront + 0.01], [0.02, 0.02, 0.01], '#1A1A1A'),
        box('spine2', 'chest', 'button-b', [0, 0.04, m.chestFront + 0.01], [0.02, 0.02, 0.01], '#1A1A1A'),
        {
          bone: 'head',
          slot: 'face',
          shape: 'cone',
          name: 'carrot',
          position: [0, m.browY - 0.02, m.faceZ + 0.02],
          size: [0.012, 0.045, 0.012],
          rotation: [Math.PI / 2, 0, 0],
          color: '#E07A3D',
          roughness: 0.6,
        },
      ];
    case 'gold-legend':
      return [
        box('spine2', 'chest', 'gold-star', [0, 0.08, m.chestFront + 0.01], [0.06, 0.06, 0.01], '#F0D78C', 0.28, 0.72),
      ];
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function specsFor(id: OutfitId, body: PlayerBody): MeshSpec[] {
  return outfitSpecs(id, body);
}

export function allOutfitSpecs(body: PlayerBody): MeshSpec[] {
  return OUTFIT_IDS.flatMap((id) => outfitSpecs(id, body));
}

/** Surface rules. A piece that fails is inside the body or floating off it. */
export function specFits(spec: MeshSpec, body: PlayerBody): boolean {
  const m = BODY_MEASURES[body];
  const [x, y, z] = spec.position;
  const [sx, sy, sz] = spec.size;
  switch (spec.slot) {
    case 'crown':
      return y >= m.hairTop - 0.02
        && y <= m.hairTop + 0.22
        && Math.abs(x) <= m.headHalf + 0.06
        && Math.abs(z) <= Math.max(m.headHalf, m.faceZ * 0.45) + 0.02;
    case 'band':
      return y >= m.browY - 0.02
        && y <= m.hairTop
        && z <= m.faceZ - 0.015
        && z >= m.headBack - 0.02
        && Math.abs(x) <= m.headHalf + 0.04;
    case 'face':
      return z >= m.faceZ - 0.012
        && z <= m.faceZ + 0.03
        && y >= -0.06
        && y <= m.browY + 0.045
        && sy <= 0.12
        && sx <= m.headHalf * 2.5;
    case 'chest':
      return z >= m.chestFront - 0.012
        && z <= m.chestFront + 0.04
        && Math.abs(x) <= m.chestHalf
        && y >= -0.08
        && y <= 0.22
        && sy <= 0.28;
    case 'back':
      return z <= m.chestBack - 0.004
        && z >= m.chestBack - 0.09
        && Math.abs(x) <= m.chestHalf
        && sy <= 0.22;
    case 'cape':
      return z <= m.chestBack + 0.008
        && z >= m.chestBack - 0.04
        && sx <= (body === 'female' ? 0.3 : 0.34)
        && sy <= 0.48
        && sz <= 0.02;
    case 'arm':
      return sx <= 0.07 && sz <= 0.07 && sy <= 0.1;
    case 'neck':
      return Math.abs(x) <= 0.08 && Math.abs(y) <= 0.06 && sx <= m.headHalf * 2.2 && sz <= 0.08;
    case 'foot':
      return true;
    default: {
      const _exhaustive: never = spec.slot;
      return _exhaustive;
    }
  }
}

const FAMILY_BLOCK = /bust|cleavage|bikini|lingerie|crop-top|stiletto|thong|blood|gore|wound/i;

export function familySafeName(name: string): boolean {
  return !FAMILY_BLOCK.test(name);
}

/** Beard and moustache stay under the eyes on both bodies. */
export function facePropClearsEyes(spec: MeshSpec, body: PlayerBody): boolean {
  if (!spec.name.includes('beard') && !spec.name.includes('moustache')) return true;
  const top = spec.position[1] + spec.size[1] / 2;
  return top <= BODY_MEASURES[body].browY - 0.015;
}
