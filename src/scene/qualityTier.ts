import type { Quality } from '../game/storage';

/** Device signals used to pick a starting graphics tier. Missing memory is treated as a desktop. */
export interface DeviceHints {
  cores: number;
  memoryGb?: number;
  /** Present when the page can read `navigator.userAgent`. Safari iPhones report 4 cores. */
  userAgent?: string;
  /** Shorter screen side in CSS pixels. */
  screenWidth?: number;
  dpr?: number;
}

/** `soft` is PCF soft. `variance` is a variance shadow map (Three has no PCSS). */
export type ShadowFilter = 'none' | 'soft' | 'variance';
export type CourtMaps = 'full' | 'rough' | 'color';
export type FenceDetail = 'link' | 'sparse' | 'plane';
export type CrowdLod = 0 | 1 | 2;
export type SkyMode = 'hdri' | 'reflect' | 'flat';
export type LampMode = 'lit' | 'emissive' | 'simple';

export interface TierProfile {
  lod: 0 | 1;
  shadows: 'none' | 'single' | 'cascaded';
  /** Renderer shadow filter. High uses VSM; medium uses PCF soft. */
  shadowFilter: ShadowFilter;
  shadowMap: number;
  contactShadows: boolean;
  ssao: boolean;
  bloom: boolean;
  dof: boolean;
  fxaa: boolean;
  ibl: boolean;
  /** Court colour, normal and roughness plate size. 2048 is the High set. */
  texture: 1024 | 2048;
  anisotropy: number;
  dpr: [number, number];
  crowd: number;
  /** Albedo, or albedo+roughness, or albedo+normal+roughness. */
  courtMaps: CourtMaps;
  fence: FenceDetail;
  decals: boolean;
  crowdLod: CrowdLod;
  crowdIdle: boolean;
  /** hdri draws the sunset as the sky. reflect keeps the sky colour and still lights metal. */
  sky: SkyMode;
  lamp: LampMode;
}

const ORDER: readonly Quality[] = ['low', 'medium', 'high'];

function rank(tier: Quality): number {
  switch (tier) {
    case 'low': return 0;
    case 'medium': return 1;
    case 'high': return 2;
    default: {
      const neverTier: never = tier;
      return neverTier;
    }
  }
}

/** Browser hints. `deviceMemory` is in gigabytes when the browser exposes it. */
export function readDevice(): DeviceHints {
  if (typeof navigator === 'undefined') return { cores: 8, memoryGb: 8 };
  const nav = navigator as Navigator & { deviceMemory?: number };
  const shorter = typeof screen !== 'undefined' ? Math.min(screen.width, screen.height) : undefined;
  return {
    cores: nav.hardwareConcurrency || 8,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    userAgent: nav.userAgent,
    screenWidth: shorter,
    dpr: typeof devicePixelRatio === 'number' ? devicePixelRatio : undefined,
  };
}

/**
 * Recent iPhones report 4 cores, which used to land on Low.
 * A 3x phone at 390 CSS px or wider starts on High. Older iPhones start on Medium.
 * Flagship Androids are 8 GB, or 8 cores with at least 6 GB.
 * Few cores or little RAM still start lower. Missing memory stays a desktop.
 */
export function detectTier(device: DeviceHints): Quality {
  if (/iPhone/i.test(device.userAgent ?? '')) {
    const dpr = device.dpr ?? 1;
    const width = device.screenWidth ?? 0;
    if (dpr >= 3 && width >= 390) return 'high';
    return 'medium';
  }
  const reported = device.memoryGb;
  if (reported !== undefined && (reported >= 8 || (device.cores >= 8 && reported >= 6))) return 'high';
  const memory = reported ?? 8;
  if (device.cores <= 4 || memory <= 2) return 'low';
  if (device.cores <= 6 || memory <= 4) return 'medium';
  return 'high';
}

/** The saved setting is a ceiling. Auto detection can only go lower. */
export function startingTier(requested: Quality, detected: Quality): Quality {
  return ORDER[Math.min(rank(requested), rank(detected))];
}

/**
 * Drop one step when a tier misses its target.
 * High aims for 60 fps. Every tier keeps a 30 fps floor.
 */
export function fallbackTier(current: Quality, fps: number): Quality {
  if (current === 'high' && fps < 55) return 'medium';
  if (fps < 30 && rank(current) > 0) return ORDER[rank(current) - 1];
  return current;
}

export function profileFor(tier: Quality): TierProfile {
  switch (tier) {
    case 'low':
      return {
        lod: 1, shadows: 'none', shadowFilter: 'none', shadowMap: 0, contactShadows: false,
        ssao: false, bloom: false, dof: false, fxaa: false, ibl: false,
        texture: 1024, anisotropy: 1, dpr: [1, 1], crowd: 8,
        courtMaps: 'color', fence: 'plane', decals: false, crowdLod: 2, crowdIdle: false,
        sky: 'flat', lamp: 'simple',
      };
    case 'medium':
      return {
        lod: 0, shadows: 'single', shadowFilter: 'soft', shadowMap: 512, contactShadows: true,
        ssao: false, bloom: false, dof: false, fxaa: true, ibl: true,
        texture: 1024, anisotropy: 4, dpr: [1, 1.25], crowd: 14,
        courtMaps: 'rough', fence: 'sparse', decals: true, crowdLod: 1, crowdIdle: true,
        sky: 'reflect', lamp: 'emissive',
      };
    case 'high':
      return {
        lod: 0, shadows: 'cascaded', shadowFilter: 'variance', shadowMap: 1024, contactShadows: true,
        ssao: true, bloom: true, dof: true, fxaa: true, ibl: true,
        texture: 2048, anisotropy: 16, dpr: [1, 1.5], crowd: 22,
        courtMaps: 'full', fence: 'link', decals: true, crowdLod: 0, crowdIdle: true,
        sky: 'hdri', lamp: 'lit',
      };
    default: {
      const neverTier: never = tier;
      return neverTier;
    }
  }
}

export function characterLod(tier: Quality): 0 | 1 {
  return profileFor(tier).lod;
}

/** Canvas `shadows` value. High is a variance shadow map. Medium is PCF soft. */
export function rendererShadows(filter: ShadowFilter, enabled: boolean): false | 'soft' | 'variance' {
  if (!enabled) return false;
  switch (filter) {
    case 'none': return false;
    case 'soft': return 'soft';
    case 'variance': return 'variance';
    default: {
      const neverFilter: never = filter;
      return neverFilter;
    }
  }
}
