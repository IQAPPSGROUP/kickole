/** Fixed camera backdrop placement and quality contract. No gameplay coordinates depend on this. */
export const ENVIRONMENT_LOD = { high: 0, medium: 1, low: 2 } as const;
/** Large enough that pastel facades read above the fence from the game camera. */
export const ENVIRONMENT_SCALE = 0.9;
/** Shift left to match the three-quarter camera; keep every vertex behind the court wall. */
export const ENVIRONMENT_OFFSET_X = -1.6;
export const ENVIRONMENT_OFFSET_Y = -0.7;
export const ENVIRONMENT_OFFSET_Z = -1.8;

export type EnvironmentTheme = 'alley' | 'street' | 'beach';

/**
 * The shipped court is the alley. Street and beach stay available when a
 * build sets VITE_LEGACY_LOCATIONS=true, or when the URL asks for them.
 */
export function resolveEnvironmentTheme(build?: string, preview?: string | null): EnvironmentTheme {
  const requested = preview && preview.length > 0 ? preview : build;
  switch (requested) {
    case 'alley':
    case 'street':
    case 'beach':
      return requested;
    default:
      return 'alley';
  }
}

const legacyLocations = import.meta.env.VITE_LEGACY_LOCATIONS === 'true';

/** Alley unless a legacy build flag or `?environment=` names street or beach. */
export const ENVIRONMENT_THEME = resolveEnvironmentTheme(
  legacyLocations ? import.meta.env.VITE_ENVIRONMENT_THEME : 'alley',
  typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('environment') : undefined,
);
