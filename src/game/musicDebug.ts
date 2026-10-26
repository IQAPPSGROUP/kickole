/** In-memory song load report. Nothing here is sent off the device. */

export type MusicDebugPhase = 'idle' | 'loading' | 'ready' | 'miss' | 'fallback';

export interface MusicDebugState {
  track: string | null;
  phase: MusicDebugPhase;
  error: string | null;
  url: string | null;
  httpStatus: number | null;
}

export const MUSIC_DEBUG_TAP_GAP_MS = 2500;
export const MUSIC_DEBUG_TAP_COUNT = 5;

const EMPTY: MusicDebugState = {
  track: null,
  phase: 'idle',
  error: null,
  url: null,
  httpStatus: null,
};

let state: MusicDebugState = EMPTY;
const listeners = new Set<() => void>();

export function musicDebugState(): MusicDebugState {
  return state;
}

export function publishMusicDebug(patch: Partial<MusicDebugState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeMusicDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** `?debug` or `?musicdebug` on a web preview. A TestFlight build has no query. */
export function musicDebugRequested(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.has('debug') || params.has('musicdebug');
}

/** Five taps inside the gap reveal the report. A slow tap starts again at one. */
export function nextMusicDebugTaps(count: number, elapsedMs: number): number {
  if (elapsedMs > MUSIC_DEBUG_TAP_GAP_MS) return 1;
  return count + 1;
}
