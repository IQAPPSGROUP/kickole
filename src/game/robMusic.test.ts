import { describe, expect, it } from 'vitest';
import { DUCK_DB, clampVolume, duckTarget, playbackDropped, shouldResumeContext } from './audioMix';
import {
  INSTRUMENTAL_FADE_SEC,
  INSTRUMENTAL_HANDOFF_SEC,
  LOOP_END_SEC,
  LOOP_FADE_SEC,
  LOOP_START_SEC,
  instrumentalHandoff,
  loadRobStems,
  nextLoopAt,
  playbackSection,
  songLoop,
} from './robMusic';

function response(ok: boolean): Response {
  return { ok, arrayBuffer: async () => new ArrayBuffer(4) } as Response;
}

function context(onDecode: () => AudioBuffer | Error): BaseAudioContext {
  return {
    decodeAudioData: async () => {
      const result = onDecode();
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as BaseAudioContext;
}

function buffer(duration: number): AudioBuffer {
  return { duration } as AudioBuffer;
}

describe('Rob song timing', () => {
  it('loops the main song from 0.6s to 146s with a crossfade inside 1.5–2s', () => {
    expect(songLoop(160)).toEqual({ start: LOOP_START_SEC, end: LOOP_END_SEC, fade: LOOP_FADE_SEC });
    expect(LOOP_FADE_SEC).toBeGreaterThanOrEqual(1.5);
    expect(LOOP_FADE_SEC).toBeLessThanOrEqual(2);
  });

  it('does not crossfade a buffer that is too short to loop', () => {
    expect(songLoop(2)).toEqual({ start: 0, end: 2, fade: 0 });
  });

  it('hands the instrumental to the song at 145.5s over 2.5s', () => {
    expect(instrumentalHandoff(160)).toEqual({ at: INSTRUMENTAL_HANDOFF_SEC, fade: INSTRUMENTAL_FADE_SEC });
    expect(instrumentalHandoff(100)).toEqual({ at: 97.5, fade: INSTRUMENTAL_FADE_SEC });
  });

  it('schedules the next loop so the crossfade finishes at the loop end', () => {
    expect(nextLoopAt(10, 145.4, 1.75)).toBeCloseTo(153.65);
    expect(nextLoopAt(0, 1, 0)).toBe(0);
  });

  it('keeps a resumed run on the main song after the instrumental has handed off', () => {
    expect(playbackSection('menu', false, false)).toBe('menu');
    expect(playbackSection('play', false, false)).toBe('instrumental');
    expect(playbackSection('play', true, false)).toBe('instrumental');
    expect(playbackSection('play', true, true)).toBe('song');
  });
});

describe('Rob file loading', () => {
  it('uses the m4a and does not request the ogg when that decodes', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(true);
    }) as typeof fetch;
    const stems = await loadRobStems(context(() => buffer(20)), { base: 'audio/rob', fetchImpl });
    expect(stems?.instrumental.duration).toBe(20);
    expect(stems?.menu.duration).toBe(20);
    expect(calls).toEqual([
      'audio/rob/gameplay-instrumental.m4a',
      'audio/rob/menu-song.m4a',
    ]);
  });

  it('uses ogg when the m4a is missing', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(!String(url).endsWith('.m4a'));
    }) as typeof fetch;
    const stems = await loadRobStems(context(() => buffer(30)), { base: '/audio/rob/', fetchImpl });
    expect(stems?.instrumental.duration).toBe(30);
    expect(stems?.menu.duration).toBe(30);
    expect(calls).toEqual([
      '/audio/rob/gameplay-instrumental.m4a',
      '/audio/rob/gameplay-instrumental.ogg',
      '/audio/rob/menu-song.m4a',
      '/audio/rob/menu-song.ogg',
    ]);
  });

  it('tries ogg when the m4a will not decode', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(true);
    }) as typeof fetch;
    const stems = await loadRobStems(context(() => {
      const url = calls[calls.length - 1] ?? '';
      if (url.endsWith('.m4a')) throw new Error('decode');
      return buffer(18);
    }), { base: '/audio/rob/', fetchImpl });
    expect(stems?.instrumental.duration).toBe(18);
    expect(stems?.menu.duration).toBe(18);
    expect(calls).toHaveLength(4);
  });

  it('returns null unless both songs load', async () => {
    const fetchImpl = (async (url: string) => response(String(url).includes('instrumental'))) as typeof fetch;
    const stems = await loadRobStems(context(() => buffer(12)), { base: '/audio/rob/', fetchImpl });
    expect(stems).toBeNull();
  });
});

describe('music duck and interruptions', () => {
  it('drops about 5 dB', () => {
    expect(duckTarget(DUCK_DB)).toBeCloseTo(10 ** (-5 / 20));
    expect(duckTarget()).toBeGreaterThan(0.56);
    expect(duckTarget()).toBeLessThan(0.57);
  });

  it('resumes a suspended or interrupted context only in the foreground after unlock', () => {
    expect(shouldResumeContext('interrupted', true, true)).toBe(true);
    expect(shouldResumeContext('suspended', true, true)).toBe(true);
    expect(shouldResumeContext('suspended', false, true)).toBe(false);
    expect(shouldResumeContext('interrupted', true, false)).toBe(false);
    expect(shouldResumeContext('running', true, true)).toBe(false);
    expect(playbackDropped('interrupted')).toBe(true);
    expect(playbackDropped('suspended')).toBe(false);
  });

  it('clamps a volume into 0..1 and treats junk as full', () => {
    expect(clampVolume(undefined)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(0.4)).toBe(0.4);
  });
});
