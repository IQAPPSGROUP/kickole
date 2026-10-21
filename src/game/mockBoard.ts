/**
 * `?mockBoard=1` opens the in-memory review board.
 * Local `vite` dev allows it. Production web builds and Capacitor release
 * builds (`npm run build` with this unset) ignore it. Cloudflare preview
 * branches set `VITE_ALLOW_MOCK=1` at build time; `main` does not.
 */
export interface MockBoardEnv {
  MODE?: string;
  VITE_ALLOW_MOCK?: string;
}

export function mockBoardAllowed(env: MockBoardEnv = import.meta.env): boolean {
  if (env.VITE_ALLOW_MOCK === '1') return true;
  return env.MODE !== 'production';
}

export function mockBoardFromSearch(search: string, env: MockBoardEnv = import.meta.env): boolean {
  if (!mockBoardAllowed(env)) return false;
  return new URLSearchParams(search).get('mockBoard') === '1';
}
