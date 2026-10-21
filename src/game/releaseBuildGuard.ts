/**
 * Store and Capacitor builds set `KICKOLE_STORE_BUILD=1`.
 * Preview Pages builds may set `VITE_ALLOW_MOCK`; those builds must not.
 */
export function assertStoreBuildOmitsMock(env: {
  KICKOLE_STORE_BUILD?: string;
  VITE_ALLOW_MOCK?: string;
}): void {
  if (env.KICKOLE_STORE_BUILD !== '1') return;
  if (env.VITE_ALLOW_MOCK == null || env.VITE_ALLOW_MOCK === '') return;
  throw new Error('VITE_ALLOW_MOCK must not be set for a Capacitor or store build.');
}
