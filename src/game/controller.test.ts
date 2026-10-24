import { beforeEach, describe, expect, it, vi } from 'vitest';
import { streakMultiplier } from '../engine/scoring';
import { vibratePattern } from './haptics';

function fakeStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
}

async function make(settings?: object) {
  vi.resetModules();
  const ls = fakeStorage();
  if (settings) ls.data['kicky.settings.v1'] = JSON.stringify(settings);
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('navigator', { vibrate: vi.fn() });
  const { GameController } = await import('./controller');
  return { c: new GameController(), ls };
}

const QUIET = { sound: false, vibration: false, quality: 'high', skinId: 'kicky-teal' };

function tickTo(c: Awaited<ReturnType<typeof make>>['c'], ms = 5) {
  const e = c.engine;
  for (let i = 0; i < 100000; i++) {
    if (e.celebration) {
      c.tick(e.config.fixedStep);
      continue;
    }
    if (e.ball.vy < 0 && e.timingDeltaMs() <= ms) return;
    c.tick(e.config.fixedStep);
  }
  throw new Error('no contact');
}

function idle(c: Awaited<ReturnType<typeof make>>['c'], seconds: number) {
  const step = c.engine.config.fixedStep;
  for (let i = 0; i < Math.round(seconds / step); i++) c.tick(step);
}

function dropRun(c: Awaited<ReturnType<typeof make>>['c']) {
  const step = c.engine.config.fixedStep;
  for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(step);
  if (c.engine.phase !== 'over') throw new Error('run did not end');
}

/** The live submit_score guards, using the token's age as elapsed time. */
function serverRejects(input: {
  score: number;
  combo: number;
  durationMs: number;
  kickTimesMs: readonly number[];
  elapsedMs: number;
}): string | null {
  const { score, combo, durationMs, kickTimesMs, elapsedMs } = input;
  if (durationMs <= 0 || durationMs > 600000) return 'invalid';
  if (durationMs > elapsedMs + 5000) return 'implausible';
  const secs = elapsedMs / 1000;
  if (score > 20000 || score > Math.ceil(secs * 25) || combo > Math.ceil(secs * 3) + 1) return 'implausible';
  const kickCount = kickTimesMs.length;
  if (kickCount < 0 || kickCount > Math.ceil(secs * 5) + 1) return 'implausible';
  if (score > 0 && kickCount < 1) return 'implausible';
  let prev = -1;
  for (const stamp of kickTimesMs) {
    if (!Number.isInteger(stamp) || stamp < prev || stamp > Math.ceil(elapsedMs) + 5000) return 'implausible';
    prev = stamp;
  }
  return null;
}

describe('GameController', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('starts on the menu and ignores presses there', async () => {
    const { c } = await make(QUIET);
    expect(c.getSnapshot().hud.phase).toBe('menu');
    c.press('left');
    expect(c.engine.phase).toBe('menu');
  });

  it('play() prepares a run and the first press launches the ball', async () => {
    const { c } = await make(QUIET);
    c.play();
    expect(c.getSnapshot().hud.phase).toBe('ready');
    c.press('right'); c.release('right');
    expect(c.getSnapshot().hud.phase).toBe('playing');
  });

  it('holds the ball while paused and ignores a kick', async () => {
    const { c } = await make(QUIET);
    c.play();
    const readyAt = c.engine.time;
    c.holdPlay(true);
    c.press('right');
    c.action();
    c.tick(0.5);
    expect(c.engine.phase).toBe('ready');
    expect(c.engine.time).toBe(readyAt);
    expect(c.playTrick('thigh')).toBe('locked');
    c.holdPlay(false);
    c.press('right');
    c.release('right');
    expect(c.engine.phase).toBe('playing');
    const playingAt = c.engine.time;
    c.holdPlay(true);
    c.tick(0.5);
    expect(c.engine.phase).toBe('playing');
    expect(c.engine.time).toBe(playingAt);
  });

  it('keeps the last track on and drops a pin that was turned off', async () => {
    const { c, ls } = await make({ ...QUIET, song: 'menu-song' });
    c.toggleSong('gameplay-instrumental');
    c.toggleSong('game-song-2');
    c.toggleSong('game-song-3');
    expect(c.getSnapshot().settings.enabledSongs).toEqual(['menu-song']);
    expect(c.getSnapshot().settings.song).toBe('menu-song');
    c.toggleSong('menu-song');
    expect(c.getSnapshot().settings.enabledSongs).toEqual(['menu-song']);
    c.toggleSong('game-song-2');
    c.toggleSong('menu-song');
    expect(c.getSnapshot().settings.song).toBe('shuffle');
    expect(c.getSnapshot().settings.enabledSongs).toEqual(['game-song-2']);
    const saved = JSON.parse(ls.data['kicky.settings.v1']) as { song: string; enabledSongs: string[] };
    expect(saved.song).toBe('shuffle');
    expect(saved.enabledSongs).toEqual(['game-song-2']);
  });

  it('space action starts from the menu and launches from ready', async () => {
    const { c } = await make(QUIET);
    c.action();
    expect(c.engine.phase).toBe('ready');
    c.action();
    expect(c.engine.phase).toBe('playing');
  });

  it('publishes score and feedback on a kick and notifies subscribers', async () => {
    const { c } = await make(QUIET);
    const cb = vi.fn();
    c.subscribe(cb);
    c.play(); c.press('left'); c.release('left');
    tickTo(c);
    c.press('right'); c.release('right');
    c.tick(0.05);
    const hud = c.getSnapshot().hud;
    expect(hud.score).toBeGreaterThan(0);
    expect(hud.kickUps).toBe(1);
    expect(hud.feedback?.kind).toBe('perfect');
    expect(cb).toHaveBeenCalled();
  });

  it('charges an early tap and does not call a late one a miss', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    c.tick(0.02);
    c.press('right');
    expect(c.engine.kickCharge?.side).toBe('right');
    expect(c.getSnapshot().hud.feedback?.kind).not.toBe('miss');
    c.release('right');
    c.engine.ball.y = 0.4;
    c.engine.ball.vy = -2.2;
    c.engine.ball.vz = 0;
    c.engine.ball.vx = 0;
    c.engine.ball.z = c.engine.config.ballZ;
    c.press('left');
    expect(c.engine.kickCharge?.side).toBe('left');
    expect(c.getSnapshot().hud.feedback?.kind).not.toBe('miss');
    expect(c.engine.phase).toBe('playing');
  });

  it('play() after game over waits for a real tap instead of launching', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(0.016);
    c.play();
    expect(c.engine.phase).toBe('ready');
    c.tick(0.3);
    expect(c.engine.phase).toBe('ready');
    expect(c.engine.ball.vy).toBe(0);
    c.press('right');
    expect(c.engine.phase).toBe('playing');
  });

  it('a tap during a celebration skips the dance and still registers', async () => {
    const { c } = await make(QUIET);
    c.play();
    c.press('left');
    c.release('left');
    c.engine.startCelebration('samba', 'streak:10', 1.2);
    expect(c.engine.celebration).not.toBeNull();
    c.press('right', 4);
    expect(c.engine.celebration).toBeNull();
    expect(c.engine.kickCharge !== null || c.engine.contact !== null).toBe(true);
  });

  it('ends the run, saves the result and exposes it', async () => {
    const { c, ls } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    tickTo(c); c.press('right'); c.release('right');
    for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(0.016);
    const snap = c.getSnapshot();
    expect(snap.hud.phase).toBe('over');
    expect(snap.result?.score).toBeGreaterThan(0);
    expect(snap.result?.newBest).toBe(true);
    expect(snap.save.best).toBe(snap.result?.score);
    expect(JSON.parse(ls.data['kicky.save.v1']).leaderboard).toHaveLength(1);
  });

  it('does not save a zero-score run', async () => {
    const { c, ls } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(0.016);
    expect(c.getSnapshot().result?.score).toBe(0);
    expect(c.getSnapshot().result?.newBest).toBe(false);
    expect(ls.data['kicky.save.v1']).toBeUndefined();
  });

  it('play() after game over restarts with a clean state, home() returns to the menu', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(0.016);
    c.play();
    let s = c.getSnapshot();
    expect(s.hud.phase).toBe('ready');
    expect(s.hud.score).toBe(0);
    expect(s.result).toBeNull();
    c.home();
    s = c.getSnapshot();
    expect(s.hud.phase).toBe('menu');
  });

  it('persists settings changes and rebuilds the wardrobe skin', async () => {
    const { c, ls } = await make(QUIET);
    c.updateSettings({ quality: 'low' });
    expect(c.getSnapshot().settings.quality).toBe('low');
    expect(c.getSnapshot().settings.graphics).toBe('low');
    expect(JSON.parse(ls.data['kicky.settings.v1']).quality).toBe('low');
    expect(JSON.parse(ls.data['kicky.settings.v1']).graphics).toBe('low');
    c.setAppearance({
      ...c.getSnapshot().save.appearance,
      skinTone: '#8D5A3C',
      hairStyle: 'afro',
    } as Parameters<typeof c.setAppearance>[0]);
    expect(c.getSnapshot().skin.body.skin).toBe('#8D5A3C');
    expect(c.getSnapshot().save.appearance.hairColor).toBe(c.getSnapshot().skin.body.hair);
    expect('hairStyle' in c.getSnapshot().save.appearance).toBe(false);
  });

  it('vibrates only when vibration is enabled', async () => {
    const on = await make({ ...QUIET, vibration: true });
    on.c.play(); on.c.press('left');
    expect((navigator.vibrate as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(vibratePattern('launch'));
    const off = await make(QUIET);
    off.c.play(); off.c.press('left');
    expect((navigator.vibrate as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  it('buzzes a foot switch only once that kick is accepted', async () => {
    const { c } = await make({ ...QUIET, vibration: true });
    const vibrate = navigator.vibrate as unknown as ReturnType<typeof vi.fn>;
    c.play();
    c.press('left');
    c.release('left');
    tickTo(c, 5);
    vibrate.mockClear();
    c.press('left');
    c.release('left');
    c.tick(c.engine.config.fixedStep);
    c.press('right');
    c.release('right');
    expect(vibrate).not.toHaveBeenCalled();
    expect(c.engine.stats.kickUps).toBe(0);
    for (let i = 0; i < 12 && c.engine.stats.kickUps === 0; i++) c.tick(c.engine.config.fixedStep);
    expect(c.engine.lastSide).toBe('right');
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(vibratePattern('perfect'));

    vibrate.mockClear();
    const early = c.engine;
    for (let i = 0; i < 100000 && !(early.ball.vy < 0 && early.timingDeltaMs() <= 200); i++) c.tick(early.config.fixedStep);
    expect(early.timingDeltaMs()).toBeGreaterThan(early.config.timing.poorMs);
    const before = early.stats.kickUps;
    c.press('left');
    c.release('left');
    expect(vibrate).not.toHaveBeenCalled();
    expect(early.stats.kickUps).toBe(before);
    for (let i = 0; i < 40 && early.stats.kickUps === before; i++) c.tick(early.config.fixedStep);
    expect(early.stats.kickUps).toBe(before + 1);
    expect(early.lastSide).toBe('left');
    expect(vibrate).toHaveBeenCalledTimes(1);
    const accepted = [vibratePattern('perfect'), vibratePattern('good'), vibratePattern('poor')];
    expect(accepted).toContainEqual(vibrate.mock.calls[0][0]);
  });

  it('grades the buzz by the touch', async () => {
    const { c } = await make({ ...QUIET, vibration: true });
    const vibrate = navigator.vibrate as unknown as ReturnType<typeof vi.fn>;
    c.play(); c.press('left'); c.release('left');
    tickTo(c);
    vibrate.mockClear();
    c.press('right'); c.release('right');
    c.tick(0.05);
    expect(vibrate).toHaveBeenCalledWith(vibratePattern('perfect'));
    c.engine.setTrick('highFlick');
    c.engine.ball.y = 2.5;
    c.engine.ball.vy = 2;
    c.engine.ball.z = c.engine.config.ballZ;
    vibrate.mockClear();
    c.press('left');
    expect(vibrate).toHaveBeenCalledWith(vibratePattern('miss'));
  });

  it('marks the HUD as stalling while a stall is held, and scores it on release', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    tickTo(c); c.press('right');
    for (let i = 0; i < 60; i++) c.tick(c.engine.config.fixedStep);
    expect(c.getSnapshot().hud.stalling).toBe(true);
    c.release('right');
    expect(c.getSnapshot().hud.stalling).toBe(false);
    expect(c.engine.stats.stalls).toBe(1);
  });

  it('starts kick times near zero on two runs after idling on the menu', async () => {
    const { c } = await make({ ...QUIET, hints: false });
    const playOne = () => {
      idle(c, 20);
      c.play();
      c.press('right');
      c.release('right');
      tickTo(c);
      c.press('left');
      c.release('left');
      c.tick(0.05);
      tickTo(c);
      c.press('right');
      c.release('right');
      c.tick(0.05);
      dropRun(c);
      const result = c.getSnapshot().result;
      if (!result) throw new Error('missing result');
      return result;
    };
    const first = playOne();
    c.home();
    const second = playOne();
    for (const result of [first, second]) {
      expect(result.kickTimesMs[0]).toBeGreaterThanOrEqual(0);
      expect(result.kickTimesMs[0]).toBeLessThan(3000);
      expect(result.durationMs).toBeGreaterThan(result.kickTimesMs[result.kickTimesMs.length - 1] ?? 0);
      expect(result.durationMs).toBeLessThan(12_000);
      expect(serverRejects({
        score: result.score,
        combo: result.combos,
        durationMs: result.durationMs,
        kickTimesMs: result.kickTimesMs,
        elapsedMs: result.durationMs,
      })).toBeNull();
    }
  });

  function juggleTo(c: Awaited<ReturnType<typeof make>>['c'], target: number) {
    c.play();
    c.press('right');
    c.release('right');
    let side: 'left' | 'right' = 'left';
    while (c.engine.streak < target && c.engine.phase === 'playing') {
      tickTo(c);
      c.press(side);
      c.release(side);
      c.tick(0.05);
      side = side === 'left' ? 'right' : 'left';
    }
    if (c.engine.streak < target) throw new Error(`streak stopped at ${c.engine.streak}`);
  }

  it('accepts a finished x4 run at streak 70 under the 25 points per second cap', async () => {
    const { c } = await make({ ...QUIET, hints: false });
    juggleTo(c, 70);
    dropRun(c);
    const result = c.getSnapshot().result;
    if (!result) throw new Error('missing result');
    expect(result.bestStreak).toBeGreaterThanOrEqual(70);
    expect(result.score).toBeLessThanOrEqual(Math.ceil((result.durationMs / 1000) * 25));
    expect(serverRejects({
      score: result.score,
      combo: result.combos,
      durationMs: result.durationMs,
      kickTimesMs: result.kickTimesMs,
      elapsedMs: result.durationMs,
    })).toBeNull();
  });

  it('unlocks Wellies on the 100th kick and will not wear a locked pair', async () => {
    vi.resetModules();
    const ls = fakeStorage();
    ls.data['kicky.settings.v1'] = JSON.stringify({ ...QUIET, hints: false });
    ls.data['kicky.save.v1'] = JSON.stringify({
      wardrobeVersion: 5,
      bodyChosen: true,
      best: 20,
      bootProgress: { kickUps: 99, rainbows: 0, bestTricksInRun: 0, bestBeats: 0, combo5: false },
      equippedBoot: 'boot-classic',
    });
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    const { GameController } = await import('./controller');
    const c = new GameController();
    c.play();
    c.press('left');
    c.release('left');
    tickTo(c);
    c.press('right');
    c.release('right');
    c.tick(0.05);
    expect(c.getSnapshot().save.bootProgress.kickUps).toBe(100);
    expect(c.getSnapshot().save.ownedBoots).toContain('boot-wellies');
    expect(c.getSnapshot().bootToast?.text).toBe('Wellies unlocked');
    expect(JSON.parse(ls.data['kicky.save.v1']).bootProgress.kickUps).toBe(100);
    c.equipBoot('boot-gold');
    expect(c.getSnapshot().save.equippedBoot).toBe('boot-classic');
    c.equipBoot('boot-wellies');
    expect(c.getSnapshot().save.equippedBoot).toBe('boot-wellies');
    expect(c.getSnapshot().skin.boots.main).toBe('#2E8B3E');
    expect(c.getSnapshot().skin.clothing.shirt).not.toBe('#2E8B3E');
  });

  it('unlocks Space boots at five clean touches and still scores at most x4', async () => {
    const { c } = await make({ ...QUIET, hints: false });
    juggleTo(c, 5);
    expect(c.getSnapshot().save.bootProgress.combo5).toBe(true);
    expect(c.getSnapshot().save.ownedBoots).toContain('boot-space');
    expect(c.getSnapshot().bootToast?.text).toBe('Space boots unlocked');
    expect(streakMultiplier(c.engine.streak)).toBe(1);
    expect(streakMultiplier(50)).toBe(4);
  });

  it('does not treat the first saved score as beating a best', async () => {
    const { c } = await make({ ...QUIET, hints: false });
    expect(c.getSnapshot().save.best).toBe(0);
    c.play();
    c.press('left');
    c.release('left');
    tickTo(c);
    c.press('right');
    c.release('right');
    c.tick(0.05);
    dropRun(c);
    expect(c.getSnapshot().save.best).toBeGreaterThan(0);
    expect(c.getSnapshot().save.bootProgress.bestBeats).toBe(0);
  });

  it('counts a beaten best and does not add kick-ups twice at the end of the run', async () => {
    vi.resetModules();
    const ls = fakeStorage();
    ls.data['kicky.settings.v1'] = JSON.stringify({ ...QUIET, hints: false });
    ls.data['kicky.save.v1'] = JSON.stringify({
      wardrobeVersion: 5,
      bodyChosen: true,
      best: 1,
      bootProgress: { kickUps: 0, rainbows: 0, bestTricksInRun: 0, bestBeats: 0, combo5: false },
    });
    vi.stubGlobal('localStorage', ls);
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    const { GameController } = await import('./controller');
    const c = new GameController();
    c.play();
    c.press('left');
    c.release('left');
    tickTo(c);
    c.press('right');
    c.release('right');
    c.tick(0.05);
    const kicks = c.getSnapshot().save.bootProgress.kickUps;
    dropRun(c);
    expect(c.getSnapshot().save.bootProgress.kickUps).toBe(kicks);
    expect(c.getSnapshot().save.bootProgress.bestBeats).toBe(1);
    expect(c.getSnapshot().save.ownedBoots).not.toContain('boot-snow');
  });

  it('rejects a continuous alternate juggle once the streak reaches 100', async () => {
    const { c } = await make({ ...QUIET, hints: false });
    juggleTo(c, 100);
    const playedMs = Math.max(1, Math.round(c.engine.time * 1000));
    expect(c.engine.stats.score).toBeGreaterThan(Math.ceil((playedMs / 1000) * 25));
    dropRun(c);
    const result = c.getSnapshot().result;
    if (!result) throw new Error('missing result');
    expect(serverRejects({
      score: result.score,
      combo: result.combos,
      durationMs: result.durationMs,
      kickTimesMs: result.kickTimesMs,
      elapsedMs: result.durationMs,
    })).toBe('implausible');
  });

});
