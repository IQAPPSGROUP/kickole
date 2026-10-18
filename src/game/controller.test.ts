import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_CONFIG } from '../engine/config';
import { fx } from '../scene/fx';
import { CALLED_FOOT_BONUS } from './called-foot';
import { getBoot } from './boots';

function fakeStorage() {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => { data[k] = v; },
    removeItem: (k: string) => { delete data[k]; },
  };
}

async function make(settings?: object, save?: object) {
  vi.resetModules();
  const ls = fakeStorage();
  if (settings) ls.data['kicky.settings.v1'] = JSON.stringify(settings);
  if (save) ls.data['kicky.save.v1'] = JSON.stringify(save);
  vi.stubGlobal('localStorage', ls);
  vi.stubGlobal('navigator', { vibrate: vi.fn() });
  const { GameController } = await import('./controller');
  return { c: new GameController(), ls };
}

const QUIET = { sound: false, vibration: false, quality: 'high', skinId: 'kicky-teal' };

function tickTo(c: Awaited<ReturnType<typeof make>>['c'], ms = 5) {
  const e = c.engine;
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs() <= ms) return;
    c.tick(e.config.fixedStep);
  }
  throw new Error('no contact');
}

function scoreKick(c: Awaited<ReturnType<typeof make>>['c'], side: 'left' | 'right') {
  tickTo(c);
  const before = c.engine.stats.score;
  let points = 0;
  const stop = c.engine.on((e) => { if (e.type === 'kick') points = e.points; });
  c.press(side);
  c.release(side);
  c.tick(0.05);
  stop();
  return { before, points, after: c.engine.stats.score };
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

  it('shows MISS feedback for a bad tap without ending the run', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    c.tick(0.02);
    c.press('right');
    expect(c.getSnapshot().hud.feedback?.kind).toBe('miss');
    expect(c.engine.phase).toBe('playing');
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

  it('persists settings changes and rebuilds the skin', async () => {
    const { c, ls } = await make(QUIET);
    c.updateSettings({ quality: 'low', skinId: 'coral-flash' });
    expect(c.getSnapshot().settings.quality).toBe('low');
    expect(c.getSnapshot().skin.id).toBe('coral-flash');
    expect(JSON.parse(ls.data['kicky.settings.v1']).quality).toBe('low');
  });

  it('vibrates only when vibration is enabled', async () => {
    const on = await make({ ...QUIET, vibration: true });
    on.c.play(); on.c.press('left');
    expect((navigator.vibrate as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    const off = await make(QUIET);
    off.c.play(); off.c.press('left');
    expect((navigator.vibrate as unknown as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
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

  it('shows each kick-up milestone once per run and cheers at 5', async () => {
    const { c } = await make(QUIET);
    fx.pulse = 0;
    fx.cheer = 0;
    fx.milestoneBurst = 0;
    c.play();
    c.press('left');
    c.release('left');
    const sides = ['right', 'left', 'right', 'left', 'right'] as const;
    for (const side of sides) scoreKick(c, side);
    const hud = c.getSnapshot().hud;
    expect(hud.kickUps).toBe(5);
    expect(hud.feedback?.kind).toBe('milestone');
    expect(hud.feedback?.text).toBe('5 KICK-UPS');
    expect(fx.pulse).toBe(1);
    expect(fx.cheer).toBe(1);
    expect(fx.milestoneBurst).toBe(1);
    const sixth = scoreKick(c, 'left');
    expect(c.getSnapshot().hud.feedback?.kind).not.toBe('milestone');
    expect(sixth.after - sixth.before).toBe(sixth.points);
    c.play();
    c.press('right');
    c.release('right');
    for (const side of sides) scoreKick(c, side);
    expect(c.getSnapshot().hud.feedback?.text).toBe('5 KICK-UPS');
  });

  it('adds the called-foot bonus only when the kick matches', async () => {
    const matched = await make(QUIET);
    matched.c.play();
    matched.c.press('right');
    matched.c.release('right');
    scoreKick(matched.c, 'left');
    scoreKick(matched.c, 'right');
    const hit = scoreKick(matched.c, 'left');
    expect(matched.c.engine.stats.kickUps).toBe(3);
    expect(hit.after - hit.before).toBe(hit.points + CALLED_FOOT_BONUS);
    expect(matched.c.getSnapshot().hud.feedback?.text).toContain('+2');

    const missed = await make(QUIET);
    missed.c.play();
    missed.c.press('right');
    missed.c.release('right');
    scoreKick(missed.c, 'left');
    scoreKick(missed.c, 'right');
    const other = scoreKick(missed.c, 'right');
    expect(other.after - other.before).toBe(other.points);
    expect(missed.c.engine.phase).toBe('playing');
  });

  it('tightens the window during a long combo and restores it when the combo breaks', async () => {
    const { c } = await make(QUIET);
    c.play();
    c.press('left');
    c.release('left');
    let side: 'left' | 'right' = 'right';
    for (let i = 0; i < 8; i++) {
      scoreKick(c, side);
      side = side === 'left' ? 'right' : 'left';
    }
    expect(c.engine.streak).toBeGreaterThanOrEqual(8);
    expect(c.engine.config.timing.perfectMs).toBeCloseTo(DEFAULT_CONFIG.timing.perfectMs * 0.92);
    expect(DEFAULT_CONFIG.timing.perfectMs).toBe(45);
    c.press('left');
    expect(c.engine.config.timing.perfectMs).toBe(DEFAULT_CONFIG.timing.perfectMs);
  });

  it('blocks a boot the player cannot afford and equips one they buy', async () => {
    const { c } = await make(QUIET);
    expect(c.buyBoot('samba')).toBe(false);
    expect(c.getSnapshot().save.equippedBoot).toBe('street');
    expect(c.getSnapshot().save.coins).toBe(0);
    c.play();
    c.press('left');
    c.release('left');
    let side: 'left' | 'right' = 'right';
    for (let i = 0; i < 12; i++) {
      scoreKick(c, side);
      side = side === 'left' ? 'right' : 'left';
    }
    for (let i = 0; i < 20000 && c.engine.phase !== 'over'; i++) c.tick(0.016);
    const coins = c.getSnapshot().save.coins;
    const price = getBoot('samba').price;
    expect(coins).toBe(c.getSnapshot().result?.score);
    expect(coins).toBeGreaterThan(0);
    expect(coins).toBeLessThan(price);
    expect(c.buyBoot('samba')).toBe(false);
    expect(c.getSnapshot().save.equippedBoot).toBe('street');
  });

  it('equips a pair once the saved balance covers the price', async () => {
    const price = getBoot('samba').price;
    const { c } = await make(QUIET, { coins: price, ownedBoots: ['street'], equippedBoot: 'street', best: 0, leaderboard: [] });
    expect(c.buyBoot('samba')).toBe(true);
    expect(c.getSnapshot().save.equippedBoot).toBe('samba');
    expect(c.getSnapshot().save.coins).toBe(0);
    expect(c.engine.config.timing.perfectMs).toBe(DEFAULT_CONFIG.timing.perfectMs + 8);
    expect(c.buyBoot('street')).toBe(true);
    expect(c.getSnapshot().save.equippedBoot).toBe('street');
    expect(c.getSnapshot().save.coins).toBe(0);
    expect(c.engine.config.timing.perfectMs).toBe(DEFAULT_CONFIG.timing.perfectMs);
  });
});
