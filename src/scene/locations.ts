import type { Quality } from '../game/storage';
import type { FenceDetail } from './qualityTier';
import { STREET_HEMI } from './daylight';
import type { EnvironmentTheme } from './environment';
import type { FenceSlot } from './streetLayout';
import { inPlayVolume } from './streetLayout';

/** Local CC0 scenery. No remote URLs. */
export const LOCATION_FILES = {
  streetHdr: 'textures/locations/street_docklands_1k.hdr',
  streetJpg: 'textures/locations/street_sky.jpg',
  courtHdr: 'textures/locations/court_green_point_1k.hdr',
  courtJpg: 'textures/locations/court_sky.jpg',
  beachHdr: 'textures/locations/beach_mondello_1k.hdr',
  beachJpg: 'textures/locations/beach_sky.jpg',
  trackColor: 'textures/locations/track_color.ktx2',
  trackNormal: 'textures/locations/track_normal.ktx2',
  trackRough: 'textures/locations/track_rough.ktx2',
  trackColorLow: 'textures/locations/track_color_low.ktx2',
  grassColor: 'textures/locations/grass_color.ktx2',
  grassNormal: 'textures/locations/grass_normal.ktx2',
  grassRough: 'textures/locations/grass_rough.ktx2',
  grassColorLow: 'textures/locations/grass_color_low.ktx2',
  sandColor: 'textures/locations/sand_color.ktx2',
  sandNormal: 'textures/locations/sand_normal.ktx2',
  sandRough: 'textures/locations/sand_rough.ktx2',
  sandColorLow: 'textures/locations/sand_color_low.ktx2',
  anthurium: 'models/environment/locations/anthurium.glb',
  barrel: 'models/environment/locations/barrel.glb',
  trash: 'models/environment/locations/trash-can.glb',
  gazania: 'models/environment/locations/gazania.glb',
} as const;

export type PropModel = 'anthurium' | 'barrel' | 'trash' | 'gazania';

export interface SkyLook {
  /** Yaw of the photographed sky, radians. */
  yaw: number;
  /** Pitch that brings the horizon down into the gameplay frame. */
  pitch: number;
  /** HDR background brightness. JPEG skies ignore tone mapping and use 1. */
  intensity: number;
  env: number;
}

export interface HemiLook {
  sky: string;
  ground: string;
  intensity: number;
}

export function locationUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export function skyFile(theme: EnvironmentTheme, quality: Quality): string {
  const low = quality === 'low';
  switch (theme) {
    case 'street': return locationUrl(low ? LOCATION_FILES.streetJpg : LOCATION_FILES.streetHdr);
    case 'court': return locationUrl(low ? LOCATION_FILES.courtJpg : LOCATION_FILES.courtHdr);
    case 'beach': return locationUrl(low ? LOCATION_FILES.beachJpg : LOCATION_FILES.beachHdr);
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

export function skyFallbackFile(theme: EnvironmentTheme): string {
  switch (theme) {
    case 'street': return locationUrl(LOCATION_FILES.streetJpg);
    case 'court': return locationUrl(LOCATION_FILES.courtJpg);
    case 'beach': return locationUrl(LOCATION_FILES.beachJpg);
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

/** Photographed skies. Pitch drops the real horizon into the downward gameplay view. */
export function skyLook(theme: EnvironmentTheme): SkyLook {
  switch (theme) {
    // Negative pitch lifts the photographed sky into a camera that looks down at the court.
    case 'street': return { yaw: 2.24, pitch: -0.6, intensity: 1.16, env: 0.62 };
    case 'court': return { yaw: 0.48, pitch: -0.52, intensity: 1.22, env: 0.68 };
    case 'beach': return { yaw: 1.76, pitch: -0.6, intensity: 1.24, env: 0.5 };
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

/** Ground bounce only. The sun and fill stay on the shared street key so faces do not change grade. */
export function locationHemi(theme: EnvironmentTheme): HemiLook {
  switch (theme) {
    case 'street': return STREET_HEMI;
    case 'court': return { sky: '#f4ffe6', ground: '#86b15c', intensity: 0.95 };
    case 'beach': return { sky: '#e9f7ff', ground: '#e6c48a', intensity: 0.92 };
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

export interface MapSet {
  color: string;
  normal: string | null;
  rough: string | null;
}

export function trackMapSet(quality: Quality): MapSet {
  if (quality === 'low') return { color: locationUrl(LOCATION_FILES.trackColorLow), normal: null, rough: null };
  if (quality === 'medium') return { color: locationUrl(LOCATION_FILES.trackColor), normal: null, rough: locationUrl(LOCATION_FILES.trackRough) };
  return {
    color: locationUrl(LOCATION_FILES.trackColor),
    normal: locationUrl(LOCATION_FILES.trackNormal),
    rough: locationUrl(LOCATION_FILES.trackRough),
  };
}

export function grassMapSet(quality: Quality): MapSet {
  if (quality === 'low') return { color: locationUrl(LOCATION_FILES.grassColorLow), normal: null, rough: null };
  if (quality === 'medium') return { color: locationUrl(LOCATION_FILES.grassColor), normal: null, rough: locationUrl(LOCATION_FILES.grassRough) };
  return {
    color: locationUrl(LOCATION_FILES.grassColor),
    normal: locationUrl(LOCATION_FILES.grassNormal),
    rough: locationUrl(LOCATION_FILES.grassRough),
  };
}

export function sandMapSet(quality: Quality): MapSet {
  if (quality === 'low') return { color: locationUrl(LOCATION_FILES.sandColorLow), normal: null, rough: null };
  if (quality === 'medium') return { color: locationUrl(LOCATION_FILES.sandColor), normal: null, rough: locationUrl(LOCATION_FILES.sandRough) };
  return {
    color: locationUrl(LOCATION_FILES.sandColor),
    normal: locationUrl(LOCATION_FILES.sandNormal),
    rough: locationUrl(LOCATION_FILES.sandRough),
  };
}

export function propUrl(model: PropModel): string {
  switch (model) {
    case 'anthurium': return locationUrl(LOCATION_FILES.anthurium);
    case 'barrel': return locationUrl(LOCATION_FILES.barrel);
    case 'trash': return locationUrl(LOCATION_FILES.trash);
    case 'gazania': return locationUrl(LOCATION_FILES.gazania);
    default: {
      const neverModel: never = model;
      return neverModel;
    }
  }
}

export interface PropSpot {
  model: PropModel;
  x: number;
  z: number;
  ry: number;
}

/**
 * Real props on the street apron, outside the freestyle box.
 * Low phones skip the GLBs and keep the photographed sky plus the court maps.
 */
export const STREET_PROPS: readonly PropSpot[] = [
  { model: 'anthurium', x: -5.35, z: 0.35, ry: 0.4 },
  { model: 'anthurium', x: -5.05, z: -2.15, ry: 1.5 },
  { model: 'anthurium', x: 5.25, z: -0.7, ry: 2.3 },
  { model: 'barrel', x: -4.75, z: 2.05, ry: 0.6 },
  { model: 'barrel', x: 5.05, z: 1.55, ry: 1.1 },
  { model: 'trash', x: -4.9, z: -3.2, ry: 0.7 },
  { model: 'gazania', x: -4.45, z: 2.55, ry: 0.2 },
  { model: 'gazania', x: 4.7, z: 2.25, ry: 1.4 },
  { model: 'gazania', x: -5.55, z: 1.65, ry: 2.1 },
];

export function streetPropsClearOfPlay(spots: readonly PropSpot[] = STREET_PROPS): boolean {
  return spots.every((spot) => !inPlayVolume(spot.x, spot.z));
}

/** Ground-level cage. The near side stays open so the camera is not behind mesh. */
export function courtFenceSlots(detail: FenceDetail): FenceSlot[] {
  if (detail === 'plane') return [];
  const slots: FenceSlot[] = [];
  const y = 0.95;
  for (let i = 0; i < 5; i++) slots.push({ x: -3.6 + i * 1.8, y, z: -3.55, ry: 0 });
  if (detail === 'link') {
    for (let i = 0; i < 4; i++) {
      const z = -2.6 + i * 1.65;
      slots.push({ x: -4.35, y, z, ry: Math.PI / 2 });
      slots.push({ x: 4.35, y, z, ry: -Math.PI / 2 });
    }
  }
  return slots;
}

export function courtFencePosts(detail: FenceDetail): FenceSlot[] {
  if (detail === 'plane') return [];
  const posts: FenceSlot[] = [];
  const y = 0.95;
  for (let i = 0; i < 6; i++) posts.push({ x: -4.5 + i * 1.8, y, z: -3.55, ry: 0 });
  if (detail === 'link') {
    for (const x of [-4.35, 4.35]) {
      for (let i = 0; i < 5; i++) posts.push({ x, y, z: -3.4 + i * 1.65, ry: 0 });
    }
  }
  return posts;
}
