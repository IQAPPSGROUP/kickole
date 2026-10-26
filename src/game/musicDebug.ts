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

/** Thin top-left strip. 10px stays clear of the score tile, which starts at 16px. */
export const MUSIC_DEBUG_UNLOCK_BOX = { x: 0, y: 0, w: 10, h: 48 } as const;

export interface MusicDebugBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** No hit target while a run can be kicked. The open report can stay up. */
export function musicDebugUnlockBox(activePlay: boolean): MusicDebugBox | null {
  if (activePlay) return null;
  return { ...MUSIC_DEBUG_UNLOCK_BOX };
}

/**
 * Open report. Under the score on a phone, and in the top centre on a short
 * landscape screen, clear of pause, the song chip, and the trick fan.
 */
export function musicDebugPanelBox(width: number, height: number): MusicDebugBox {
  const landscape = width > height && height <= 600;
  const w = landscape ? Math.min(180, Math.round(width * 0.3)) : Math.min(220, Math.round(width * 0.7));
  const h = landscape ? 68 : 88;
  return {
    x: Math.round((width - w) / 2),
    y: landscape ? 8 : 156,
    w,
    h,
  };
}

export function boxesOverlap(a: MusicDebugBox, b: MusicDebugBox): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
