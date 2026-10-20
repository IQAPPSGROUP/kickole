import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    if (e.ball.vy < 0 && e.timingDeltaMs() <= ms) return;
    c.tick(e.config.fixedStep);
  }
  throw new Error('no contact');
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

  it('charges an early tap and shows MISS for a late one', async () => {
    const { c } = await make(QUIET);
    c.play(); c.press('left'); c.release('left');
    c.tick(0.02);
    c.press('right');
    expect(c.engine.kickCharge?.side).toBe('right');
    expect(c.getSnapshot().hud.feedback?.kind).not.toBe('miss');
    c.release('right');
    // A normal launch is still inside the foot window when it reaches the ground.
    // A slow drop already below the foot is the late miss.
    c.engine.ball.y = 0.4;
    c.engine.ball.vy = -2.2;
    c.engine.ball.vz = 0;
    c.engine.ball.vx = 0;
    c.engine.ball.z = c.engine.config.ballZ;
    c.press('left');
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
    });
    expect(c.getSnapshot().skin.body.skin).toBe('#8D5A3C');
    expect(c.getSnapshot().skin.hairStyle).toBe('afro');
    expect(c.getSnapshot().save.appearance.hairStyle).toBe('afro');
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

  it('gives unlock and restore feedback instead of leaving the shop busy', async () => {
    const { c } = await make(QUIET);
    const purchase = await c.purchaseLaunchCollection();
    expect(purchase.outcome).toBe('unavailable');
    expect(c.getSnapshot().billingMessage).toMatch(/iOS|Android|browser/i);
    expect(c.getSnapshot().billingBusy).toBe(false);
    const restore = await c.restorePurchases();
    expect(restore.outcome).toBe('unavailable');
    expect(c.getSnapshot().billingMessage).toBeTruthy();
    expect(c.getSnapshot().billingBusy).toBe(false);
  });
});
