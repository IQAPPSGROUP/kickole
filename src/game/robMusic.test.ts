import { describe, expect, it } from 'vitest';
import { DUCK_DB, clampVolume, duckTarget, playbackDropped, shouldResumeContext } from './audioMix';
import {
  GAMEPLAY_TRACKS,
  LOOP_END_SEC,
  LOOP_FADE_SEC,
  LOOP_START_SEC,
  TRACK_CROSSFADE_SEC,
  TRACK_HANDOFF_BEFORE_END_SEC,
  TRACK_LEAD_IN_SEC,
  loadTrack,
  nextLoopAt,
  choiceAfterSkip,
  pickTrack,
  resumePlan,
  shuffleNames,
  songLoop,
  trackWindow,
} from './robMusic';

function response(ok: boolean, type = 'audio/mp4', bytes?: ArrayBuffer): Response {
  const body = bytes ?? new ArrayBuffer(4);
  return {
    ok,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null) },
    arrayBuffer: async () => body,
  } as Response;
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

  it('schedules the next loop so the crossfade finishes at the loop end', () => {
    expect(nextLoopAt(10, 145.4, 1.75)).toBeCloseTo(153.65);
    expect(nextLoopAt(0, 1, 0)).toBe(0);
  });
});

describe('gameplay playlist', () => {
  it('trims the lead-in and starts the next track 3.5s before the file ends', () => {
    expect(trackWindow(149)).toEqual({
      offset: TRACK_LEAD_IN_SEC,
      handoff: 149 - TRACK_HANDOFF_BEFORE_END_SEC,
      fade: TRACK_CROSSFADE_SEC,
    });
    expect(trackWindow(149, 40)).toEqual({ offset: 40, handoff: 145.5, fade: TRACK_CROSSFADE_SEC });
  });

  it('starts Keep It in the Air at the top and crossfades from 155.5s for 2s', () => {
    expect(trackWindow(158.6, undefined, 'game-song-2')).toEqual({ offset: 0, handoff: 155.5, fade: 2 });
    expect(trackWindow(158.6, 40, 'game-song-2')).toEqual({ offset: 40, handoff: 155.5, fade: 2 });
    expect(resumePlan(158.6, 0, 'game-song-2')).toEqual({ action: 'resume', offset: 0 });
    expect(resumePlan(158.6, 156, 'game-song-2')).toEqual({ action: 'advance' });
  });

  it('starts Don\'t Let It Drop at the top and crossfades from 152s for 2.5s', () => {
    expect(trackWindow(157, undefined, 'game-song-3')).toEqual({ offset: 0, handoff: 152, fade: 2.5 });
    expect(resumePlan(157, 12, 'game-song-3')).toEqual({ action: 'resume', offset: 12 });
    expect(resumePlan(157, 152, 'game-song-3')).toEqual({ action: 'advance' });
  });

  it('continues a later run from the saved place and advances only in the ending', () => {
    expect(resumePlan(149, 12)).toEqual({ action: 'resume', offset: 12 });
    expect(resumePlan(149, 0.2)).toEqual({ action: 'resume', offset: TRACK_LEAD_IN_SEC });
    expect(resumePlan(149, 146)).toEqual({ action: 'advance' });
  });

  it('shuffles without dropping or repeating a name', () => {
    let step = 0;
    const draws = [0.9, 0, 0.5];
    const order = shuffleNames(['a', 'b', 'c', 'd'], () => draws[step++] ?? 0);
    expect(order).toEqual(['c', 'b', 'a', 'd']);
    expect(new Set(shuffleNames(GAMEPLAY_TRACKS, () => 0.3)).size).toBe(GAMEPLAY_TRACKS.length);
  });

  it('skips a missing track and does not play the same song twice in a row', () => {
    const failed = new Set(['game-song-2', 'game-song-3']);
    expect(pickTrack(GAMEPLAY_TRACKS, 0, failed, null)).toEqual({ name: 'gameplay-instrumental', index: 0 });
    expect(pickTrack(GAMEPLAY_TRACKS, 1, failed, 'gameplay-instrumental')).toEqual({ name: 'menu-song', index: 1 });
    expect(pickTrack(GAMEPLAY_TRACKS, 2, failed, 'menu-song')).toEqual({ name: 'gameplay-instrumental', index: 0 });
    expect(pickTrack(['only'], 0, new Set(), 'only')).toEqual({ name: 'only', index: 0 });
  });

  it('advances a chosen song to the next title and leaves shuffle on the shuffled order', () => {
    expect(choiceAfterSkip('gameplay-instrumental', ['game-song-3', 'menu-song'], 'gameplay-instrumental', new Set())).toEqual({
      choice: 'menu-song',
      track: { name: 'menu-song', index: 1 },
    });
    expect(choiceAfterSkip('shuffle', ['game-song-3', 'menu-song', 'gameplay-instrumental'], 'game-song-3', new Set())).toEqual({
      choice: 'shuffle',
      track: { name: 'menu-song', index: 1 },
    });
    expect(choiceAfterSkip('shuffle', GAMEPLAY_TRACKS, 'menu-song', new Set(['game-song-2', 'game-song-3']))).toEqual({
      choice: 'shuffle',
      track: { name: 'gameplay-instrumental', index: 0 },
    });
  });
});

describe('Rob file loading', () => {
  it('uses the m4a and does not request the ogg when that decodes', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(true);
    }) as typeof fetch;
    const decoded = await loadTrack(context(() => buffer(20)), 'menu-song', { base: 'audio/rob', fetchImpl });
    expect(decoded?.duration).toBe(20);
    expect(calls).toEqual(['audio/rob/menu-song.m4a']);
  });

  it('uses ogg when the m4a is missing', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(!String(url).endsWith('.m4a'));
    }) as typeof fetch;
    const decoded = await loadTrack(context(() => buffer(30)), 'game-song-2', { base: '/audio/rob/', fetchImpl });
    expect(decoded?.duration).toBe(30);
    expect(calls).toEqual([
      '/audio/rob/game-song-2.m4a',
      '/audio/rob/game-song-2.ogg',
    ]);
  });

  it('tries ogg when the m4a will not decode', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(true);
    }) as typeof fetch;
    const decoded = await loadTrack(context(() => {
      const url = calls[calls.length - 1] ?? '';
      if (url.endsWith('.m4a')) throw new Error('decode');
      return buffer(18);
    }), 'game-song-3', { base: '/audio/rob/', fetchImpl });
    expect(decoded?.duration).toBe(18);
    expect(calls).toEqual([
      '/audio/rob/game-song-3.m4a',
      '/audio/rob/game-song-3.ogg',
    ]);
  });

  it('skips an html shell and returns null when both formats fail', async () => {
    const html = new TextEncoder().encode('<!doctype html><title>app</title>').buffer;
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(true, 'text/html; charset=utf-8', html);
    }) as typeof fetch;
    let decoded = 0;
    const missing = await loadTrack(context(() => {
      decoded += 1;
      return buffer(12);
    }), 'game-song-2', { base: '/audio/rob/', fetchImpl });
    expect(missing).toBeNull();
    expect(decoded).toBe(0);
    expect(calls).toEqual([
      '/audio/rob/game-song-2.m4a',
      '/audio/rob/game-song-2.ogg',
    ]);
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
