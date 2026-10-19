/** Fixed camera backdrop placement and quality contract. No gameplay coordinates depend on this. */
export const ENVIRONMENT_LOD = { high: 0, medium: 1, low: 2 } as const;
/** Large enough that pastel facades read above the fence from the game camera. */
export const ENVIRONMENT_SCALE = 0.9;
/** Shift left to match the three-quarter camera; keep every vertex behind the court wall. */
export const ENVIRONMENT_OFFSET_X = -1.6;
export const ENVIRONMENT_OFFSET_Y = -0.7;
export const ENVIRONMENT_OFFSET_Z = -1.8;
