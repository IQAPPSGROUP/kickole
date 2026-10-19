import { OPENING_DURATION_SEC } from './openingCamera';

export type OpeningIntroPhase = 'idle' | 'waiting' | 'playing' | 'done';

export interface OpeningIntroSnapshot {
  phase: OpeningIntroPhase;
  /** True while the scenic reveal (or its env wait) should hide the home UI. */
  active: boolean;
  progress: number;
  reducedMotion: boolean;
}

const ENV_WAIT_MS = 4500;
const listeners = new Set<() => void>();

let phase: OpeningIntroPhase = 'idle';
let reducedMotion = false;
let paused = false;
let elapsed = 0;
let waitTimer: ReturnType<typeof setTimeout> | null = null;
let visibilityBound = false;
/** Cached for useSyncExternalStore — must return a stable reference when unchanged. */
let snapshot: OpeningIntroSnapshot = {
  phase: 'idle',
  active: false,
  progress: 0,
  reducedMotion: false,
};

function emit() {
  listeners.forEach((listener) => listener());
}

function refreshSnapshot() {
  // Only phase/active/reducedMotion notify React. Progress is derived on read so
  // per-frame camera ticks do not invalidate useSyncExternalStore.
  const active = phase === 'waiting' || phase === 'playing';
  if (
    snapshot.phase === phase
    && snapshot.active === active
    && snapshot.reducedMotion === reducedMotion
  ) {
    return;
  }
  snapshot = {
    phase,
    active,
    progress: progressOf(),
    reducedMotion,
  };
}

function clearWait() {
  if (waitTimer !== null) {
    clearTimeout(waitTimer);
    waitTimer = null;
  }
}

function progressOf(): number {
  if (phase === 'done') return 1;
  if (phase === 'playing' || phase === 'waiting') return Math.min(1, elapsed / OPENING_DURATION_SEC);
  return 0;
}

function finish() {
  clearWait();
  if (phase === 'done') return;
  phase = 'done';
  elapsed = OPENING_DURATION_SEC;
  refreshSnapshot();
  emit();
}

function beginPlay() {
  if (phase !== 'waiting') return;
  clearWait();
  phase = 'playing';
  elapsed = 0;
  refreshSnapshot();
  emit();
}

function onVisibility() {
  paused = typeof document !== 'undefined' && document.hidden;
}

/** Call once on app mount. Reduced motion skips straight to the home camera. */
export function initOpeningIntro() {
  if (phase !== 'idle') return;
  reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reducedMotion) {
    phase = 'done';
    elapsed = OPENING_DURATION_SEC;
    refreshSnapshot();
    emit();
    return;
  }
  phase = 'waiting';
  waitTimer = setTimeout(beginPlay, ENV_WAIT_MS);
  if (typeof document !== 'undefined' && !visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
  }
  refreshSnapshot();
  emit();
}

/** Environment GLB loaded or fell back — start the pan (bounded by ENV_WAIT_MS). */
export function notifyEnvironmentReady() {
  if (phase === 'waiting') beginPlay();
}

export function skipOpeningIntro() {
  finish();
}

/** Starting a run (button or keyboard) cancels the reveal and restores gameplay framing. */
export function cancelOpeningIntroForGameplay() {
  finish();
}

/** Advance the pan while visible. Returns eased progress 0..1 for sampling. */
export function tickOpeningIntro(dt: number): number {
  if (phase === 'done') return 1;
  if (phase !== 'playing') return 0;
  if (!paused) {
    elapsed += dt;
    if (elapsed >= OPENING_DURATION_SEC) finish();
  }
  return Math.min(1, elapsed / OPENING_DURATION_SEC);
}

export function getOpeningIntroSnapshot(): OpeningIntroSnapshot {
  // Stable identity required by useSyncExternalStore (React 19).
  return snapshot;
}

export function subscribeOpeningIntro(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isOpeningIntroActive() {
  return phase === 'waiting' || phase === 'playing';
}

export function isOpeningIntroDone() {
  return phase === 'done';
}

/** Test helper — resets module state between cases. */
export function resetOpeningIntroForTests() {
  clearWait();
  phase = 'idle';
  reducedMotion = false;
  paused = false;
  elapsed = 0;
  snapshot = { phase: 'idle', active: false, progress: 0, reducedMotion: false };
  if (visibilityBound && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibility);
    visibilityBound = false;
  }
}

export function setOpeningIntroPausedForTests(value: boolean) {
  paused = value;
}

export { OPENING_DURATION_SEC, ENV_WAIT_MS };
