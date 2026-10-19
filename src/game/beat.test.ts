import { describe, expect, it } from 'vitest';
import {
  BEAT_GOOD_MS,
  BEAT_PERFECT_MS,
  GAMEPLAY_BPM,
  beatErrorMs,
  beatPeriod,
  beatsToSeconds,
  gradeBeat,
  groovePoints,
  readBeat,
} from './beat';

describe('beat scoring', () => {
  const period = beatPeriod(GAMEPLAY_BPM);

  it('treats gameplay as 112 bpm quarter notes', () => {
    expect(GAMEPLAY_BPM).toBe(112);
    expect(period).toBeCloseTo(60 / 112, 8);
    expect(beatsToSeconds(2)).toBeCloseTo(period * 2, 8);
  });

  it('is zero on the beat and wraps across the bar', () => {
    const origin = 10;
    expect(beatErrorMs(origin, origin, GAMEPLAY_BPM)).toBeCloseTo(0, 6);
    expect(beatErrorMs(origin + period, origin, GAMEPLAY_BPM)).toBeCloseTo(0, 6);
    expect(beatErrorMs(origin + period * 4, origin, GAMEPLAY_BPM)).toBeCloseTo(0, 5);
    expect(beatErrorMs(origin + period / 2, origin, GAMEPLAY_BPM)).toBeCloseTo((period / 2) * 1000, 4);
  });

  it('reports early taps as positive and late taps as negative', () => {
    const origin = 3;
    expect(beatErrorMs(origin + 0.04, origin, GAMEPLAY_BPM)).toBeGreaterThan(0);
    expect(beatErrorMs(origin - 0.04, origin, GAMEPLAY_BPM)).toBeLessThan(0);
  });

  it('subtracts output latency so a tap on the heard beat still scores', () => {
    const origin = 2;
    const latency = 0.06;
    // The note is scheduled at `origin`, but the speakers emit it `latency` later.
    const heard = origin + latency;
    expect(Math.abs(beatErrorMs(heard, origin, GAMEPLAY_BPM, latency))).toBeLessThan(1);
    expect(gradeBeat(beatErrorMs(heard, origin, GAMEPLAY_BPM, latency))).toBe('perfect');
    // Ignoring latency would push a 60 ms speaker delay toward the edge of the window.
    const raw = beatErrorMs(heard, origin, GAMEPLAY_BPM, 0);
    expect(Math.abs(raw)).toBeGreaterThan(50);
  });

  it('grades perfect, good and off inside the published windows', () => {
    expect(gradeBeat(0)).toBe('perfect');
    expect(gradeBeat(BEAT_PERFECT_MS)).toBe('perfect');
    expect(gradeBeat(-(BEAT_PERFECT_MS + 1))).toBe('good');
    expect(gradeBeat(BEAT_GOOD_MS)).toBe('good');
    expect(gradeBeat(BEAT_GOOD_MS + 1)).toBe('off');
  });

  it('adds a bonus only when the groove tap lands on the beat', () => {
    expect(groovePoints(2, 'off')).toBe(2);
    expect(groovePoints(2, 'good')).toBe(4);
    expect(groovePoints(2, 'perfect')).toBe(6);
    expect(groovePoints(2, 'perfect', 5, 1)).toBe(7);
  });

  it('keeps a visual pulse when the music flag is off', () => {
    const onBeat = readBeat({ now: 4, origin: 4, bpm: GAMEPLAY_BPM, latency: 0.04, music: false });
    expect(onBeat.music).toBe(false);
    expect(onBeat.pulse).toBeCloseTo(1, 5);
    expect(onBeat.phase).toBeCloseTo(0, 5);
    const halfway = readBeat({ now: 4 + period / 2, origin: 4, bpm: GAMEPLAY_BPM, latency: 0, music: false });
    expect(halfway.pulse).toBeCloseTo(0, 5);
    expect(halfway.phase).toBeCloseTo(0.5, 5);
  });
});
