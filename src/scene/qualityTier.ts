import type { Quality } from '../game/storage';

/** Device signals used to pick a starting graphics tier. Missing memory is treated as a desktop. */
export interface DeviceHints {
  cores: number;
  memoryGb?: number;
}

export interface TierProfile {
  lod: 0 | 1;
  shadows: 'none' | 'single' | 'cascaded';
  shadowMap: number;
  contactShadows: boolean;
  ssao: boolean;
  bloom: boolean;
  dof: boolean;
  fxaa: boolean;
  ibl: boolean;
  dpr: [number, number];
  crowd: number;
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
  return {
    cores: nav.hardwareConcurrency || 8,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
  };
}

/** Phones with few cores or little RAM start lower. Desktops stay on the requested tier. */
export function detectTier(device: DeviceHints): Quality {
  const memory = device.memoryGb ?? 8;
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
        lod: 1, shadows: 'none', shadowMap: 0, contactShadows: false, ssao: false, bloom: false,
        dof: false, fxaa: false, ibl: false, dpr: [1, 1], crowd: 8,
      };
    case 'medium':
      return {
        lod: 0, shadows: 'single', shadowMap: 512, contactShadows: true, ssao: false, bloom: false,
        dof: false, fxaa: true, ibl: true, dpr: [1, 1.25], crowd: 16,
      };
    case 'high':
      return {
        lod: 0, shadows: 'cascaded', shadowMap: 1024, contactShadows: true, ssao: true, bloom: true,
        dof: true, fxaa: true, ibl: true, dpr: [1, 1.5], crowd: 28,
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
