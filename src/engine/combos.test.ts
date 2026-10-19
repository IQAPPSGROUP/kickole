import { describe, expect, it } from 'vitest';
import { createComboTracker, pushComboEvent, resetComboTracker } from './combos';
import { GameEngine } from './engine';

function stepN(e: GameEngine, n: number) {
  for (let i = 0; i < n; i++) e.step(e.config.fixedStep);
}

function started() {
  const e = new GameEngine();
  e.prepare('ready');
  e.press('left'); e.release('left');
  return e;
}

function toContact(e: GameEngine, ms = 5) {
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs() <= ms) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('no contact');
}

function fallThrough(e: GameEngine, height: number, z: number) {
  e.ball.y = height + 0.7; e.ball.vy = 0; e.ball.vx = 0; e.ball.vz = 0; e.ball.x = 0; e.ball.z = z;
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs(height) <= 8) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('no window');
}

describe('combo tracker', () => {
  it('awards flick → header once and ignores replayed tokens', () => {
    const s = createComboTracker();
    expect(pushComboEvent(s, 'highFlick', 1, 'a')).toEqual([]);
    const awards = pushComboEvent(s, 'header', 1.5, 'b');
    expect(awards).toHaveLength(1);
    expect(awards[0].id).toBe('flickHeader');
    expect(awards[0].points).toBe(5);
    expect(pushComboEvent(s, 'header', 1.5, 'b')).toEqual([]);
  });

  it('expires incomplete chains', () => {
    const s = createComboTracker();
    pushComboEvent(s, 'highFlick', 1, 'a', { varietyBonus: 5, expirySec: 1 });
    expect(pushComboEvent(s, 'header', 3, 'b', { varietyBonus: 5, expirySec: 1 })).toEqual([]);
  });

  it('does not award from failed or incomplete ATW', () => {
    const s = createComboTracker();
    pushComboEvent(s, 'footStall', 1, 'a');
    expect(pushComboEvent(s, 'footTouch', 1.2, 'b')).toEqual([]);
    expect(s.progress.find((p) => p.id === 'stallAtw')).toBeUndefined();
  });

  it('awards alternating foot ↔ thigh in either order', () => {
    const s = createComboTracker();
    pushComboEvent(s, 'thighTouch', 1, 't1');
    const a = pushComboEvent(s, 'footTouch', 1.4, 'f1');
    expect(a[0]?.id).toBe('altFootThigh');
    resetComboTracker(s);
    pushComboEvent(s, 'footTouch', 2, 'f2');
    expect(pushComboEvent(s, 'thighTouch', 2.3, 't2')[0]?.id).toBe('altFootThigh');
  });
});

describe('engine combinations', () => {
  it('awards +5 for high flick → header', () => {
    const e = started();
    const combos: string[] = [];
    e.on((ev) => { if (ev.type === 'combo') combos.push(ev.id); });
    e.setTrick('highFlick');
    toContact(e); e.press('right'); e.release('right'); stepN(e, 8);
    // Loft into forehead window after the flick.
    fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z);
    e.attemptHeader();
    expect(e.stats.combos).toBe(1);
    expect(combos).toContain('flickHeader');
    expect(e.stats.score).toBeGreaterThanOrEqual(1 + 2 + 3 + 5);
  });

  it('awards header → neck catch → release', () => {
    const e = started();
    const combos: string[] = [];
    e.on((ev) => { if (ev.type === 'combo') combos.push(ev.id); });
    fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z);
    e.attemptHeader();
    // Let header recover clear so the neck window can open.
    stepN(e, Math.ceil(0.4 / e.config.fixedStep));
    fallThrough(e, e.config.contacts.nape.y, e.config.contacts.nape.z);
    e.pressNeck();
    expect(e.stats.neckStalls).toBe(1);
    e.releaseNeck();
    expect(combos).toContain('headerNeckRelease');
    expect(e.stats.combos).toBe(1);
  });

  it('awards stall → ATW return', () => {
    const e = started();
    const combos: string[] = [];
    e.on((ev) => { if (ev.type === 'combo') combos.push(ev.id); });
    toContact(e); e.press('left'); stepN(e, 60); e.release('left'); stepN(e, 8);
    e.setTrick('aroundTheWorld');
    toContact(e); e.press('right'); e.release('right');
    stepN(e, Math.ceil(e.config.tricks.atwRevolutionTime / e.config.fixedStep) + 4);
    toContact(e); e.press('left'); e.release('left'); stepN(e, 8);
    expect(combos).toContain('stallAtw');
  });

  it('never awards a combo from a mistimed header after a flick', () => {
    const e = started();
    e.setTrick('highFlick');
    toContact(e); e.press('right'); e.release('right'); stepN(e, 8);
    e.ball.y = e.config.contacts.forehead.y + 1.2; e.ball.vy = 0; e.ball.z = e.config.contacts.forehead.z;
    stepN(e, 5);
    e.attemptHeader();
    expect(e.stats.headers).toBe(0);
    expect(e.stats.combos).toBe(0);
  });
});
