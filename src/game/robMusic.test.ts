import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { DUCK_DB, clampVolume, duckTarget, playbackDropped, shouldRestartMusicOnForeground, shouldResumeContext } from './audioMix';
import {
  GAMEPLAY_TRACKS,
  LOOP_END_SEC,
  LOOP_FADE_SEC,
  LOOP_START_SEC,
  OPENER_TRACK_ID,
  ROTATION_TRACKS,
  TRACK_CROSSFADE_SEC,
  TRACK_HANDOFF_BEFORE_END_SEC,
  TRACK_LEAD_IN_SEC,
  RobPlayer,
  choiceAfterSkip,
  loadTrack,
  nextLoopAt,
  nextRotationTrack,
  openingPlaylist,
  pickTrack,
  resumePlan,
  shuffleNames,
  songLoop,
  trackWindow,
} from './robMusic';

function response(ok: boolean, type = 'audio/mp4', bytes?: ArrayBuffer, status = ok ? 200 : 404): Response {
  const body = bytes ?? new ArrayBuffer(4);
  return {
    ok,
    status,
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

  it('decodes an iOS media response whose status is 0 and does not ask for ogg', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      return response(false, 'audio/mp4', new ArrayBuffer(8), 0);
    }) as typeof fetch;
    const decoded = await loadTrack(context(() => buffer(149)), 'gameplay-instrumental', { base: 'audio/rob', fetchImpl });
    expect(decoded?.duration).toBe(149);
    expect(calls).toEqual(['audio/rob/gameplay-instrumental.m4a']);
  });

  it('tries ogg when a status 0 body is empty', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(String(url));
      const m4a = String(url).endsWith('.m4a');
      return response(!m4a, 'audio/mp4', m4a ? new ArrayBuffer(0) : new ArrayBuffer(8), m4a ? 0 : 200);
    }) as typeof fetch;
    const decoded = await loadTrack(context(() => buffer(12)), 'menu-song', { base: '/audio/rob/', fetchImpl });
    expect(decoded?.duration).toBe(12);
    expect(calls).toEqual(['/audio/rob/menu-song.m4a', '/audio/rob/menu-song.ogg']);
  });

  it('does not decode a real HTTP error', async () => {
    let decoded = 0;
    const fetchImpl = (async () => response(false, 'audio/mp4', new ArrayBuffer(8), 404)) as typeof fetch;
    const missing = await loadTrack(context(() => {
      decoded += 1;
      return buffer(12);
    }), 'game-song-2', { base: '/audio/rob/', fetchImpl });
    expect(missing).toBeNull();
    expect(decoded).toBe(0);
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
    expect(shouldRestartMusicOnForeground(true, true)).toBe(true);
    expect(shouldRestartMusicOnForeground(true, false)).toBe(false);
    expect(shouldRestartMusicOnForeground(false, true)).toBe(false);
  });

  it('clamps a volume into 0..1 and treats junk as full', () => {
    expect(clampVolume(undefined)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampVolume(1.5)).toBe(1);
    expect(clampVolume(-0.2)).toBe(0);
    expect(clampVolume(0.4)).toBe(0.4);
  });
});

describe('run opener and decode budget', () => {
  const pcmBytes = (seconds: number) => Math.round(seconds * 44100 * 2 * 4);

  it('opens a shuffle on Alley Beat, then rotates the other three without a repeat', () => {
    const playlist = openingPlaylist([...GAMEPLAY_TRACKS], () => 0);
    expect(playlist[0]).toBe(OPENER_TRACK_ID);
    expect(new Set(playlist).size).toBe(4);
    expect(playlist.slice(1).every((id) => (ROTATION_TRACKS as readonly string[]).includes(id))).toBe(true);
    expect(nextRotationTrack(playlist, OPENER_TRACK_ID, new Set())?.name).toBe(playlist[1]);
    let current: string | null = OPENER_TRACK_ID;
    const played: string[] = [];
    for (let i = 0; i < 6; i++) {
      const next = nextRotationTrack(playlist, current, new Set());
      expect(next).not.toBeNull();
      expect(next?.name).not.toBe(OPENER_TRACK_ID);
      expect(next?.name).not.toBe(current);
      played.push(next!.name);
      current = next!.name;
    }
    expect(new Set(played)).toEqual(new Set(ROTATION_TRACKS));
    expect(openingPlaylist(ROTATION_TRACKS, () => 0)).not.toContain(OPENER_TRACK_ID);
  });

  it('keeps four decoded songs well above the two-buffer cap', () => {
    const alley = pcmBytes(149);
    const rise = pcmBytes(149);
    const air = pcmBytes(158.6);
    const drop = pcmBytes(157);
    const all = alley + rise + air + drop;
    expect(all).toBe(216_478_080);
    expect(air + drop).toBeLessThan(all / 2 + alley);
    expect(alley + air).toBeLessThan(120_000_000);
  });

  it('decodes Alley Beat alone at run start, then only the next song', async () => {
    const clock = { currentTime: 0 };
    const loads: string[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    const ctx = {
      get currentTime() { return clock.currentTime; },
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          },
          connect(target: unknown) { return target; },
        };
      },
      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          onended: null as null | (() => void),
          connect(target: { connect?: (node: unknown) => unknown }) { return target; },
          start() {},
          stop() {},
        };
      },
    };
    const load = async (name: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      loads.push(name);
      await Promise.resolve();
      inFlight -= 1;
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(
      ctx as unknown as AudioContext,
      {} as AudioNode,
      () => {},
      load,
      () => {},
      () => 0,
    );
    const flush = async () => {
      for (let i = 0; i < 8; i++) await Promise.resolve();
    };
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    expect(loads).toEqual(['menu-song', OPENER_TRACK_ID]);
    expect(player.retainedTracks()).toEqual([OPENER_TRACK_ID]);
    expect(maxInFlight).toBe(1);
    const scheduled = player as unknown as { prefetchAt: number };
    clock.currentTime = scheduled.prefetchAt + 0.3;
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flush();
    expect(loads).toEqual(['menu-song', OPENER_TRACK_ID, 'game-song-2']);
    expect(new Set(player.retainedTracks())).toEqual(new Set([OPENER_TRACK_ID, 'game-song-2']));
    expect(loads).not.toContain('game-song-3');
    player.releaseDecoded();
    expect(player.retainedTracks()).toEqual([]);
    player.stop();
  });

  it('loads Alley Beat again when setMode is retried after a miss', async () => {
    const clock = { currentTime: 0 };
    const loads: string[] = [];
    const results: boolean[] = [];
    let open = false;
    const ctx = {
      get currentTime() { return clock.currentTime; },
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          },
          connect(target: unknown) { return target; },
        };
      },
      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          onended: null as null | (() => void),
          connect(target: { connect?: (node: unknown) => unknown }) { return target; },
          start() {},
          stop() {},
        };
      },
    };
    const load = async (name: string) => {
      loads.push(name);
      await Promise.resolve();
      return open ? { duration: 149 } as AudioBuffer : null;
    };
    const player = new RobPlayer(
      ctx as unknown as AudioContext,
      {} as AudioNode,
      (_mode, ok) => { results.push(ok); },
      load,
      () => {},
      () => 0,
    );
    const flush = async () => {
      for (let i = 0; i < 12; i++) await Promise.resolve();
    };
    try {
      player.setMode('play');
      await flush();
      expect(results).toEqual([false]);
      expect(loads[0]).toBe(OPENER_TRACK_ID);
      open = true;
      player.forgetMisses();
      player.setMode('play');
      await flush();
      expect(results).toEqual([false, true]);
      expect(loads[loads.length - 1]).toBe(OPENER_TRACK_ID);
      expect(player.retainedTracks()).toEqual([OPENER_TRACK_ID]);
    } finally {
      player.stop();
    }
  });
});

describe('change song', () => {
  function rig() {
    const clock = { currentTime: 0 };
    const stops: number[] = [];
    const starts: number[] = [];
    const ctx = {
      get currentTime() { return clock.currentTime; },
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          },
          connect(target: unknown) { return target; },
        };
      },
      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          onended: null as null | (() => void),
          connect(target: { connect?: (node: unknown) => unknown }) { return target; },
          start() { starts.push(clock.currentTime); },
          stop(at?: number) { stops.push(at ?? clock.currentTime); },
        };
      },
    };
    return { clock, stops, starts, ctx: ctx as unknown as AudioContext };
  }

  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  it('stops the previous track and updates the label before the next file decodes', async () => {
    const { clock, stops, starts, ctx } = rig();
    const heard: Array<string | null> = [];
    const gate: { release: ((value: AudioBuffer) => void) | null } = { release: null };
    const load = async (name: string) => {
      if (name === 'game-song-2') {
        return new Promise<AudioBuffer>((resolve) => { gate.release = resolve; });
      }
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    const stopsBefore = stops.length;
    const startsBefore = starts.length;
    clock.currentTime = 12;
    expect(player.skip()).toBe('shuffle');
    expect(heard[heard.length - 1]).toBe('game-song-2');
    expect(stops.length).toBe(stopsBefore);
    expect(starts.length).toBe(startsBefore);
    const open = gate.release;
    if (!open) throw new Error('next track did not start decoding');
    open({ duration: 149 } as AudioBuffer);
    await flush();
    expect(stops.slice(stopsBefore).some((at) => at <= 12.05)).toBe(true);
    expect(starts.length).toBe(startsBefore + 1);
    expect(heard[heard.length - 1]).toBe('game-song-2');
    player.stop();
  });

  it('skips from the menu without waiting for a run', async () => {
    const { clock, stops, ctx } = rig();
    const heard: Array<string | null> = [];
    const loads: string[] = [];
    const load = async (name: string) => {
      loads.push(name);
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    expect(heard[heard.length - 1]).toBe('menu-song');
    const stopsBefore = stops.length;
    clock.currentTime = 4;
    expect(player.skip()).toBe(OPENER_TRACK_ID);
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    expect(stops.length).toBe(stopsBefore);
    await flush();
    expect(stops.slice(stopsBefore).some((at) => at <= 4.05)).toBe(true);
    expect(loads).toContain(OPENER_TRACK_ID);
    player.stop();
  });

  it('a second skip before the first file decodes lands on the following track', async () => {
    const { clock, ctx } = rig();
    const heard: Array<string | null> = [];
    const pending: Array<(value: AudioBuffer) => void> = [];
    const load = async (name: string) => {
      if (name === 'menu-song' || name === OPENER_TRACK_ID) return { duration: 149 } as AudioBuffer;
      return new Promise<AudioBuffer>((resolve) => { pending.push(resolve); });
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    clock.currentTime = 3;
    player.skip();
    player.skip();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    for (const resolve of pending) resolve({ duration: 149 } as AudioBuffer);
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    expect(heard.filter((name) => name === 'game-song-2').length).toBe(1);
    player.stop();
  });

  it('keeps AAC m4a files for WKWebView and ogg beside them', () => {
    for (const name of GAMEPLAY_TRACKS) {
      const m4a = readFileSync(new URL(`../../public/audio/rob/${name}.m4a`, import.meta.url));
      const ogg = readFileSync(new URL(`../../public/audio/rob/${name}.ogg`, import.meta.url));
      expect(m4a.length).toBeGreaterThan(100_000);
      expect(m4a.subarray(4, 8).toString()).toBe('ftyp');
      expect(ogg.subarray(0, 4).toString()).toBe('OggS');
    }
  });
});

describe('song state machine', () => {
  function rig(loadImpl?: (name: string) => Promise<AudioBuffer>) {
    const clock = { currentTime: 0 };
    const stops: number[] = [];
    const starts: number[] = [];
    const ctx = {
      get currentTime() { return clock.currentTime; },
      createGain() {
        return {
          gain: {
            value: 1,
            setValueAtTime() {},
            linearRampToValueAtTime() {},
            cancelScheduledValues() {},
          },
          connect(target: unknown) { return target; },
        };
      },
      createBufferSource() {
        return {
          buffer: null as AudioBuffer | null,
          onended: null as null | (() => void),
          connect(target: { connect?: (node: unknown) => unknown }) { return target; },
          start() { starts.push(clock.currentTime); },
          stop(at?: number) { stops.push(at ?? clock.currentTime); },
        };
      },
    };
    const loads: string[] = [];
    const load = loadImpl ?? (async (name: string) => {
      loads.push(name);
      return { duration: 149 } as AudioBuffer;
    });
    return { clock, stops, starts, loads, ctx: ctx as unknown as AudioContext, load };
  }

  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };

  const handoffAt = (player: RobPlayer) => (player as unknown as { handoffAt: number }).handoffAt;

  async function settleTick() {
    await new Promise((resolve) => setTimeout(resolve, 150));
    await flush();
  }

  it('pins a menu pill tap and starts the run on that song, not a fresh Alley Beat', async () => {
    const { ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    expect(heard[heard.length - 1]).toBe('menu-song');
    // The menu bed is We Rise. The first tap must still be able to land on it later,
    // and it must pin the song the run will actually open on.
    const first = player.skip();
    const second = player.skip();
    await flush();
    expect(first).toBe(OPENER_TRACK_ID);
    expect(second).not.toBe('shuffle');
    expect(second).not.toBe(OPENER_TRACK_ID);
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(second);
    expect(heard[heard.length - 1]).not.toBe(OPENER_TRACK_ID);
    player.stop();
  });

  it('keeps a pinned song across game over, unmute, and an interruption resume', async () => {
    const { ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('play');
    await flush();
    player.setSongChoice('game-song-3');
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    player.setMode('menu');
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    player.stop();
    player.setMode('menu');
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    player.resume();
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-3');
    player.stop();
  });

  it('resumes the song that was playing when a shuffle run is unmuted', async () => {
    const { ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    expect(player.skip()).toBe('shuffle');
    await flush();
    const duringRun = heard[heard.length - 1];
    expect(duringRun).toBe('game-song-2');
    player.stop();
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(duringRun);
    player.stop();
  });

  it('returns a shuffle run to We Rise on the menu, which is the bed that is playing', async () => {
    const { ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    player.skip();
    await flush();
    player.setMode('menu');
    await flush();
    expect(heard[heard.length - 1]).toBe('menu-song');
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    player.stop();
  });

  it('hands the next song on when a menu track reaches its end', async () => {
    const { clock, starts, ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setSongChoice('game-song-2');
    await flush();
    expect(heard[heard.length - 1]).toBe('game-song-2');
    const before = starts.length;
    const at = handoffAt(player);
    expect(at).toBeGreaterThan(10);
    clock.currentTime = at + 0.5;
    await settleTick();
    expect(starts.length).toBeGreaterThan(before);
    expect(heard[heard.length - 1]).toBe('game-song-2');
    player.stop();
  });

  it('rotates off Alley Beat when a shuffle run reaches the handoff', async () => {
    const { clock, ctx, load } = rig();
    const heard: Array<string | null> = [];
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    clock.currentTime = handoffAt(player) + 0.5;
    await settleTick();
    expect(heard[heard.length - 1]).toBe('game-song-2');
    expect(heard[heard.length - 1]).not.toBe(OPENER_TRACK_ID);
    player.stop();
  });

  it('does not go silent when Shuffle is chosen while the next song is still decoding', async () => {
    const { stops, ctx } = rig();
    const heard: Array<string | null> = [];
    const pending: Array<(value: AudioBuffer) => void> = [];
    const load = async (name: string) => {
      if (name === 'game-song-2') return new Promise<AudioBuffer>((resolve) => { pending.push(resolve); });
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('play');
    await flush();
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    const stopsBefore = stops.length;
    player.setSongChoice('game-song-2');
    player.setSongChoice('shuffle');
    await flush();
    expect(stops.length).toBe(stopsBefore);
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    for (const resolve of pending) resolve({ duration: 149 } as AudioBuffer);
    await flush();
    expect(heard[heard.length - 1]).toBe(OPENER_TRACK_ID);
    player.stop();
  });

  it('leaves the current song playing until the next file is ready', async () => {
    const { clock, stops, starts, ctx } = rig();
    const heard: Array<string | null> = [];
    const gate: { release: ((value: AudioBuffer) => void) | null } = { release: null };
    const load = async (name: string) => {
      if (name === 'game-song-2') return new Promise<AudioBuffer>((resolve) => { gate.release = resolve; });
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('play');
    await flush();
    clock.currentTime = 12;
    const stopsBefore = stops.length;
    const startsBefore = starts.length;
    expect(player.skip()).toBe('shuffle');
    expect(heard[heard.length - 1]).toBe('game-song-2');
    expect(stops.length).toBe(stopsBefore);
    expect(starts.length).toBe(startsBefore);
    const open = gate.release;
    if (!open) throw new Error('next track did not start decoding');
    open({ duration: 149 } as AudioBuffer);
    await flush();
    expect(stops.slice(stopsBefore).some((at) => at <= 12.05)).toBe(true);
    expect(starts.length).toBe(startsBefore + 1);
    expect(heard[heard.length - 1]).toBe('game-song-2');
    player.stop();
  });

  it('warns once when a file fails and tries that file again on the next run', async () => {
    const warnings: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((message) => { warnings.push(String(message)); });
    const { clock, ctx } = rig();
    const heard: Array<string | null> = [];
    let failSong2 = true;
    const loads: string[] = [];
    const load = async (name: string) => {
      loads.push(name);
      if (name === 'game-song-2' && failSong2) return null;
      return { duration: 149 } as AudioBuffer;
    };
    const player = new RobPlayer(ctx, {} as AudioNode, () => {}, load, (name) => { heard.push(name); }, () => 0);
    player.setMode('play');
    await flush();
    player.skip();
    await flush();
    expect(warnings.some((line) => line.includes('game-song-2'))).toBe(true);
    expect(heard[heard.length - 1]).not.toBe('game-song-2');
    const warned = warnings.length;
    player.skip();
    await flush();
    expect(warnings.length).toBe(warned);
    failSong2 = false;
    player.setMode('menu');
    await flush();
    player.setMode('play');
    await flush();
    const runs = loads.filter((name) => name === 'game-song-2').length;
    clock.currentTime = handoffAt(player) + 0.5;
    await settleTick();
    expect(loads.filter((name) => name === 'game-song-2').length).toBeGreaterThan(runs);
    spy.mockRestore();
    player.stop();
  });
});
