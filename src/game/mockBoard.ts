/**
 * Longest nicknames the rules allow, longest first.
 * Used only by the in-memory preview crowd. Board rows have no kit field.
 */
export const PREVIEW_LONG_NICKNAMES = [
  'Supersonic Midfielder XXXVIII',
  'Lightning Midfielder XXXVIII',
] as const;

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

/** Dev-only stand-in crowd size. Ignored unless `?mockBoard=1` is already allowed. */
export function mockCrowdFromSearch(search: string, env: MockBoardEnv = import.meta.env): number | undefined {
  if (!mockBoardFromSearch(search, env)) return undefined;
  const raw = new URLSearchParams(search).get('mockPlayers');
  if (raw == null || raw === '') return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/** Score the leaderboard sheet should show. The mock review card is not phase `over`. */
export function shownBoardScore(args: {
  phase: string;
  best: number;
  hudScore: number;
  resultScore: number | null;
  reviewScore: number | null;
}): number {
  if (args.phase === 'over' && args.resultScore != null) return args.resultScore;
  if (args.reviewScore != null) return args.reviewScore;
  if (args.phase === 'menu') return args.best;
  return args.hudScore;
}
