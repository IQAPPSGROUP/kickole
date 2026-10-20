import type { GraphicsChoice, Quality } from '../game/storage';

/** Device signals used to pick a starting graphics tier. Missing memory is treated as a desktop. */
export interface DeviceHints {
  cores: number;
  memoryGb?: number;
  /** Unmasked WebGL renderer. Empty when the browser hides it. */
  gpu?: string;
}

export type CourtMaps = 'full' | 'rough' | 'color';
export type FenceDetail = 'link' | 'sparse' | 'plane';
export type CrowdLod = 0 | 1 | 2;
export type SkyMode = 'hdri' | 'reflect' | 'flat';
export type LampMode = 'lit' | 'emissive' | 'simple';

export interface TierProfile {
  lod: 0 | 1;
  /** Tight box around the player, or no dynamic shadows. */
  shadows: 'none' | 'tight';
  shadowMap: number;
  /** PCSS reads a basic depth map. Variance is the softer medium filter. */
  shadowFilter: 'off' | 'vsm' | 'pcss';
  /** Ortho half-extent, in metres, centred on the player. */
  shadowExtent: number;
  /** Light size in texels for PCSS, or the variance blur radius. */
  shadowRadius: number;
  contactShadows: boolean;
  ssao: boolean;
  bloom: boolean;
  dof: boolean;
  aa: 'none' | 'fxaa' | 'smaa';
  ibl: boolean;
  dpr: [number, number];
  crowd: number;
  /** Albedo, or albedo+roughness, or albedo+normal+roughness. */
  courtMaps: CourtMaps;
  fence: FenceDetail;
  decals: boolean;
  crowdLod: CrowdLod;
  crowdIdle: boolean;
  /** hdri draws the sunny daytime sky. reflect keeps the sky colour and still lights metal. */
  sky: SkyMode;
  lamp: LampMode;
}

const ORDER: readonly Quality[] = ['low', 'medium', 'high'];

export const FPS_FLOOR = 30;
export const FPS_DROP_AFTER_SEC = 5;

export interface FpsGuardState {
  underSec: number;
}

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

/**
 * Phones that should start on High: A15 and newer, Apple M, Adreno 7xx, Mali-G7xx, Immortalis.
 * Safari reports current iPhones as "Apple GPU" with no A-number, so that string counts too.
 * An explicit older A-series name, such as A14, does not.
 */
export function isFlagshipGpu(renderer: string): boolean {
  const g = renderer.toLowerCase().trim();
  if (!g || /swiftshader|llvmpipe|softpipe|microsoft basic render/.test(g)) return false;
  if (/adreno(?:\s*\(tm\))?\s*7\d\d\b/.test(g)) return true;
  if (/mali-g7\d\d/.test(g) || /immortalis/.test(g)) return true;
  const appleGen = g.match(/\bapple a(\d+)\b/);
  if (appleGen) return Number(appleGen[1]) >= 15;
  if (/apple m\d/.test(g) || /\bapple gpu\b/.test(g)) return true;
  return false;
}

/** Name a GPU from its unmasked renderer string. Unknown names return null so the CPU hint is used. */
export function gpuTier(renderer: string): Quality | null {
  const g = renderer.toLowerCase().trim();
  if (!g) return null;
  if (/swiftshader|llvmpipe|softpipe|microsoft basic render/.test(g)) return 'low';

  const adreno = g.match(/adreno(?:\s*\(tm\))?\s*(\d{3})/);
  if (adreno) {
    const model = Number(adreno[1]);
    if (model >= 700) return 'high';
    if (model < 610) return 'low';
    if (model < 620) return 'medium';
    return 'high';
  }

  if (/immortalis/.test(g)) return 'high';

  const mali = g.match(/mali-([tg])(\d+)/);
  if (mali) {
    if (mali[1] === 't') return 'low';
    const model = Number(mali[2]);
    if (model <= 51) return 'low';
    if (model <= 57) return 'medium';
    return 'high';
  }

  if (/powervr|videocore|video core/.test(g)) return 'low';
  const appleGen = g.match(/\bapple a(\d+)\b/);
  if (appleGen) {
    const gen = Number(appleGen[1]);
    if (gen >= 15) return 'high';
    if (gen >= 12) return 'medium';
    return 'low';
  }
  if (/apple m\d|\bapple gpu\b/.test(g)) return 'high';

  if (g.includes('intel')) {
    if (/arc|iris xe|iris\(r\) xe|iris plus/.test(g)) return 'high';
    if (/hd graphics (3|4|5|6)00|hd graphics 3000|hd graphics 4000|uhd graphics 6/.test(g)) return 'low';
    return 'medium';
  }

  if (/nvidia|geforce|quadro|rtx|gtx/.test(g)) return 'high';

  if (/radeon|amd/.test(g)) {
    if (/vega [38]|vega 11|radeon\(tm\) graphics|radeon graphics/.test(g)) return 'medium';
    return 'high';
  }

  return null;
}

/** Browser hints. `deviceMemory` is in gigabytes when the browser exposes it. */
export function readDevice(): DeviceHints {
  if (typeof navigator === 'undefined') return { cores: 8, memoryGb: 8, gpu: gpuName };
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: nav.hardwareConcurrency || 8,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
    gpu: gpuName,
  };
}

let gpuName = '';
let deviceSnapshot: DeviceHints | null = null;
const deviceListeners = new Set<() => void>();

export function getDeviceSnapshot(): DeviceHints {
  if (!deviceSnapshot) deviceSnapshot = readDevice();
  return deviceSnapshot;
}

export function subscribeDevice(listener: () => void): () => void {
  deviceListeners.add(listener);
  return () => deviceListeners.delete(listener);
}

/** Remember the live WebGL renderer so auto tier selection can use the GPU. */
export function rememberGpu(renderer: string): void {
  const next = renderer.trim();
  if (gpuName === next && deviceSnapshot) return;
  gpuName = next;
  deviceSnapshot = readDevice();
  deviceListeners.forEach((listener) => listener());
}

function cpuTier(device: DeviceHints): Quality {
  const memory = device.memoryGb ?? 8;
  if (device.cores <= 4 || memory <= 2) return 'low';
  if (device.cores <= 6 || memory <= 4) return 'medium';
  return 'high';
}

/**
 * GPU name first. A software renderer or 2 GB forces Low.
 * A15+, Adreno 7xx, Mali-G7xx and Immortalis stay on High instead of stepping down for a 4–6 core phone.
 * Any other strong GPU on a small CPU still steps down. The FPS guard can still drop a tier later.
 */
export function detectTier(device: DeviceHints): Quality {
  const cpu = cpuTier(device);
  const gpu = device.gpu ? gpuTier(device.gpu) : null;
  if (!gpu) return cpu;
  if (gpu === 'low' || (device.memoryGb ?? 8) <= 2) return 'low';
  if (device.gpu && isFlagshipGpu(device.gpu)) return 'high';
  if (gpu === 'high' && cpu === 'low' && device.cores >= 4 && (device.memoryGb ?? 8) >= 4) return 'medium';
  return ORDER[Math.min(rank(gpu), rank(cpu))];
}

/** Auto follows the device. An explicit choice is the tier the player asked to save. */
export function resolveTier(preference: GraphicsChoice, detected: Quality): Quality {
  switch (preference) {
    case 'auto':
      return detected;
    case 'low':
    case 'medium':
    case 'high':
      return preference;
    default: {
      const neverChoice: never = preference;
      return neverChoice;
    }
  }
}

export function createFpsGuard(): FpsGuardState {
  return { underSec: 0 };
}

/**
 * Drop one tier after the smoothed frame rate stays under 30 for five seconds.
 * A single long frame, or a return above 30, clears the timer. Low stays put.
 */
export function stepFpsGuard(state: FpsGuardState, tier: Quality, fps: number, dt: number): Quality {
  if (!(dt > 0) || dt > 0.5 || fps >= FPS_FLOOR || rank(tier) === 0) {
    state.underSec = 0;
    return tier;
  }
  state.underSec += dt;
  if (state.underSec < FPS_DROP_AFTER_SEC) return tier;
  state.underSec = 0;
  return ORDER[rank(tier) - 1];
}

let runningTier: Quality | null = null;
const runningListeners = new Set<() => void>();

export function getRunningTier(): Quality | null {
  return runningTier;
}

export function subscribeRunningTier(listener: () => void): () => void {
  runningListeners.add(listener);
  return () => runningListeners.delete(listener);
}

export function publishRunningTier(tier: Quality): void {
  if (runningTier === tier) return;
  runningTier = tier;
  runningListeners.forEach((listener) => listener());
}

export function profileFor(tier: Quality): TierProfile {
  switch (tier) {
    case 'low':
      return {
        lod: 1, shadows: 'none', shadowMap: 0, shadowFilter: 'off', shadowExtent: 0, shadowRadius: 0,
        contactShadows: false, ssao: false, bloom: false, dof: false, aa: 'none', ibl: false,
        dpr: [1, 1], crowd: 8,
        courtMaps: 'color', fence: 'plane', decals: false, crowdLod: 2, crowdIdle: false,
        sky: 'flat', lamp: 'simple',
      };
    case 'medium':
      return {
        lod: 0, shadows: 'tight', shadowMap: 512, shadowFilter: 'vsm', shadowExtent: 4.8, shadowRadius: 4,
        contactShadows: true, ssao: false, bloom: false, dof: false, aa: 'fxaa', ibl: true,
        dpr: [1, 1.25], crowd: 16,
        courtMaps: 'rough', fence: 'sparse', decals: true, crowdLod: 1, crowdIdle: true,
        sky: 'reflect', lamp: 'emissive',
      };
    case 'high':
      return {
        lod: 0, shadows: 'tight', shadowMap: 1024, shadowFilter: 'pcss', shadowExtent: 3.2, shadowRadius: 28,
        contactShadows: false, ssao: true, bloom: true, dof: true, aa: 'smaa', ibl: true,
        dpr: [1, 1.5], crowd: 28,
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
