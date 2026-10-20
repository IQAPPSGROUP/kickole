import type { Quality } from '../game/storage';

/** Shifts the purchased alley so y=0 is the concrete and the camera faces the corner. */
export const ALLEY_OFFSET = { x: 1.43, y: -0.261502, z: 6.3 } as const;

/**
 * Pitch lifts the photographed sky into the downward gameplay frame.
 * Yaw puts the Cape Town towers on the open side, behind the player.
 */
export const ALLEY_SKY_LOOK = { yaw: 2.2, pitch: 0, background: 1.08, environment: 0.38 } as const;

/** Floor map multiplier. The photograph is already mid-grey; this stops the sun blowing it white. */
export const ALLEY_FLOOR_TINT = '#b9b9b9';

export const ALLEY_FILES = {
  model: 'models/env/alley_game.glb',
  modelLow: 'models/env/alley_game_low.glb',
  sky: 'textures/alley/homecoming_1k.hdr',
  skyLow: 'textures/alley/alley_sky.jpg',
} as const;

export function alleyUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export function alleyModelUrl(quality: Quality): string {
  return alleyUrl(quality === 'low' ? ALLEY_FILES.modelLow : ALLEY_FILES.model);
}

export function alleySkyUrl(quality: Quality): string {
  return alleyUrl(quality === 'low' ? ALLEY_FILES.skyLow : ALLEY_FILES.sky);
}

/** Contact-sheet cameras. Gameplay framing is unchanged when the query is absent. */
export const ALLEY_VIEWS = {
  wide: { fov: 52, position: [6.6, 7.4, 12.2] as const, look: [0.3, 1.2, -4.8] as const },
  reverse: { fov: 50, position: [-0.2, 1.55, -4.6] as const, look: [0.2, 2.8, 9.5] as const },
} as const;

export type AlleyView = keyof typeof ALLEY_VIEWS;

export function alleyViewFromSearch(search: string): AlleyView | null {
  const view = new URLSearchParams(search).get('view');
  switch (view) {
    case 'wide':
    case 'reverse':
      return view;
    default:
      return null;
  }
}

/** Two strings across the alley mouth, above head height. */
export const ALLEY_BUNTING: readonly { z: number; y: number; x0: number; x1: number; count: number }[] = [
  { z: -2.15, y: 3.42, x0: -3.5, x1: 3.15, count: 16 },
  { z: -4.05, y: 3.15, x0: -2.4, x1: 2.9, count: 12 },
];
