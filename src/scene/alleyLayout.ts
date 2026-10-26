import type { Quality } from '../game/storage';

/** Shifts the purchased alley so y=0 is the concrete and the camera faces the corner. */
export const ALLEY_OFFSET = { x: 1.43, y: -0.261502, z: 6.3 } as const;

/**
 * Yaw turns the city towers onto the open end of the alley.
 * Pitch stays level so a head-height camera meets the horizon, not the plaza.
 */
export const ALLEY_SKY_LOOK = { yaw: 1.6, pitch: 0, background: 1.05, environment: 0.34 } as const;

/** Floor map multiplier. The photograph is already mid-grey; this stops the sun blowing it white. */
export const ALLEY_FLOOR_TINT = '#b9b9b9';

export const ALLEY_FILES = {
  model: 'models/env/alley_game.glb',
  modelLow: 'models/env/alley_game_low.glb',
  sky: 'textures/alley/modern_buildings_2_1k.hdr',
  skyLow: 'textures/alley/modern_buildings_2.jpg',
} as const;

export function alleyUrl(file: string): string {
  return `${import.meta.env.BASE_URL}${file}`;
}

export function alleyModelUrl(quality: Quality): string {
  return alleyUrl(quality === 'low' ? ALLEY_FILES.modelLow : ALLEY_FILES.model);
}

/**
 * Every tier shows the tone-mapped JPEG. The 1K HDR stays in the repo for the
 * daylight reference, but binding it as a float background was a large GPU
 * allocation on the phone that lost the context.
 */
export function alleySkyUrl(_quality: Quality): string {
  return alleyUrl(ALLEY_FILES.skyLow);
}

/** Contact-sheet cameras. Gameplay framing is unchanged when the query is absent. */
export const ALLEY_VIEWS = {
  wide: { fov: 46, position: [2.6, 2.2, 8.8] as const, look: [0.05, 2.05, -5.4] as const },
  reverse: { fov: 48, position: [0.15, 1.6, -2.7] as const, look: [0.4, 3.2, 9] as const },
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

/**
 * Wordmark on the camera-facing brick, above the chain-link and to the right
 * of the portrait score card. The letters keep the source aspect.
 */
export const ALLEY_WORDMARK = 'brand/kickole-wordmark.webp';

export const ALLEY_MURAL = {
  position: [0.76, 2.68, -7.03] as const,
  size: [2.386, 0.858] as const,
};
