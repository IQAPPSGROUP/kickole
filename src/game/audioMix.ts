/** Music ducks about 5 dB while a trick or combo sting is playing. */
export const DUCK_DB = 5;
export const DUCK_ATTACK_SEC = 0.05;
export const DUCK_RELEASE_SEC = 0.3;

export function clampVolume(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

/** Linear gain for a drop of `db` decibels from unity. */
export function duckTarget(db = DUCK_DB): number {
  return 10 ** (-db / 20);
}

/**
 * iOS can leave the context `interrupted` or `suspended` after a call,
 * Siri, or a silent switch. Resume only while the game is in the foreground.
 */
export function shouldResumeContext(state: string, foreground: boolean, unlocked: boolean): boolean {
  if (!foreground || !unlocked) return false;
  return state === 'suspended' || state === 'interrupted';
}

/** iOS drops playing buffers when the context is interrupted. A plain suspend does not. */
export function playbackDropped(state: string): boolean {
  return state === 'interrupted';
}
