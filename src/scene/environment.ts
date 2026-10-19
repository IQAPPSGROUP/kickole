/** Fixed camera backdrop placement and quality contract. No gameplay coordinates depend on this. */
export const ENVIRONMENT_LOD = { high: 0, medium: 1, low: 2 } as const;
export const ENVIRONMENT_SCALE = 0.65;
export const ENVIRONMENT_OFFSET_Z = -2;

export type EnvironmentTheme = 'street' | 'beach';
export function resolveEnvironmentTheme(build?: string, preview?: string | null): EnvironmentTheme {
  return (preview ?? build) === 'beach' ? 'beach' : 'street';
}

/** Production uses a build setting. Only the dev viewer accepts a URL override. */
export const ENVIRONMENT_THEME = resolveEnvironmentTheme(
  import.meta.env.VITE_ENVIRONMENT_THEME,
  import.meta.env.DEV && typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('environment') : undefined,
);
