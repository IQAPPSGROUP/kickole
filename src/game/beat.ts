/** Quarter-note clock shared by the boom-bap bed and groove scoring. */

/** Gameplay tempo. The menu bed sits a touch slower, in audio.ts. */
export const GAMEPLAY_BPM = 92;

export const MENU_BPM = 90;

/** Used when the audio device has not reported output latency. */
export const DEFAULT_OUTPUT_LATENCY_SEC = 0.045;

/** Windows around the heard beat. Wide enough for speaker and Bluetooth delay. */
export const BEAT_PERFECT_MS = 80;
export const BEAT_GOOD_MS = 140;

export type BeatGrade = 'perfect' | 'good' | 'off';

export interface BeatClock {
  bpm: number;
  /** Seconds on the audio clock, or a performance clock before the graph exists. */
  now: number;
  /** Time of beat 0 on the same clock. */
  origin: number;
  /**
   * Seconds to subtract so a tap lines up with the sound leaving the speakers.
   * The scheduler places notes on the audio clock; players hear them later.
   */
  latency: number;
  /** False while music is muted. The phase and pulse stay valid either way. */
  music: boolean;
  /** 0 on the beat, 0.5 halfway to the next quarter note. */
  phase: number;
  /** 1 on the beat, 0 halfway. Drawn even when music is muted. */
  pulse: number;
}

export function beatPeriod(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

export function beatsToSeconds(beats: number, bpm = GAMEPLAY_BPM): number {
  return beats * beatPeriod(bpm);
}

/**
 * Signed milliseconds to the nearest quarter note.
 * Positive means the tap is early (before the heard beat). Negative means late.
 */
export function beatErrorMs(now: number, origin: number, bpm: number, latencySec = 0): number {
  const period = beatPeriod(bpm);
  const shifted = now - origin - latencySec;
  const wrapped = ((shifted % period) + period) % period;
  const delta = wrapped <= period / 2 ? wrapped : wrapped - period;
  return delta * 1000;
}

export function gradeBeat(
  errorMs: number,
  perfectMs = BEAT_PERFECT_MS,
  goodMs = BEAT_GOOD_MS,
): BeatGrade {
  const abs = Math.abs(errorMs);
  if (abs <= perfectMs) return 'perfect';
  if (abs <= goodMs) return 'good';
  return 'off';
}

export function grooveBeatBonus(grade: BeatGrade, perfect = 4, good = 2): number {
  switch (grade) {
    case 'perfect': return perfect;
    case 'good': return good;
    case 'off': return 0;
    default: {
      const exhaustive: never = grade;
      return exhaustive;
    }
  }
}

/** Base groove touch plus the on-beat bonus. Off-beat touches still score the base. */
export function groovePoints(base: number, grade: BeatGrade, perfect = 4, good = 2): number {
  return base + grooveBeatBonus(grade, perfect, good);
}

export function readBeat(input: {
  now: number;
  origin: number;
  bpm: number;
  latency: number;
  music: boolean;
}): BeatClock {
  const period = beatPeriod(input.bpm);
  const shifted = input.now - input.origin;
  const wrapped = ((shifted % period) + period) % period;
  const phase = period === 0 ? 0 : wrapped / period;
  const pulse = Math.cos(phase * Math.PI * 2) * 0.5 + 0.5;
  return {
    bpm: input.bpm,
    now: input.now,
    origin: input.origin,
    latency: input.latency,
    music: input.music,
    phase,
    pulse,
  };
}
