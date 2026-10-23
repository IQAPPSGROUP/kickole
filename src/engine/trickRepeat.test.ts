import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import {
  TRICK_REPEAT_LIMIT,
  emptyTrickRepeat,
  scoreTrickRepeat,
  trickRepeatLeft,
  trickRepeatText,
} from './trickRepeat';
import type { TrickKind } from './tricks';

function stepN(e: GameEngine, n: number) {
  for (let i = 0; i < n; i++) e.step(e.config.fixedStep);
}

function started() {
  const e = new GameEngine();
  e.prepare('ready');
  e.press('left');
  e.release('left');
  return e;
}

function runUntilContactDelta(e: GameEngine, targetMs: number, height = e.config.contactHeight) {
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs(height) <= targetMs) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('never reached');
}

function fallThrough(e: GameEngine, height: number, z: number, targetMs = 8) {
  e.ball.y = height + 0.7;
  e.ball.vy = 0;
  e.ball.vx = 0;
  e.ball.vz = 0;
  e.ball.x = 0;
  e.ball.z = z;
  runUntilContactDelta(e, targetMs, height);
}

function header(e: GameEngine) {
  const before = e.stats.score;
  fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z, 8);
  e.attemptHeader();
  for (let i = 0; i < 80 && e.trick; i++) e.step(e.config.fixedStep);
  return e.stats.score - before;
}

function thigh(e: GameEngine) {
  const before = e.stats.score;
  e.setTrick('thigh');
  fallThrough(e, e.config.contacts.thigh.y, e.config.contacts.thigh.z, 8);
  e.press('left');
  e.release('left');
  settle(e);
  return e.stats.score - before;
}

function settle(e: GameEngine) {
  for (let i = 0; i < 40 && (e.contact || e.trick); i++) e.step(e.config.fixedStep);
}

function foot(e: GameEngine) {
  const before = e.stats.score;
  e.setTrick(null);
  runUntilContactDelta(e, 8);
  e.press('right');
  e.release('right');
  settle(e);
  return e.stats.score - before;
}

describe('trick repeat counter', () => {
  it('pays ten in a row, then nothing until a different trick', () => {
    let state = emptyTrickRepeat();
    const kinds: TrickKind[] = ['header', 'thigh', 'neckStall', 'aroundTheWorld', 'highFlick', 'groove'];
    for (const kind of kinds) {
      const gained: number[] = [];
      for (let use = 0; use < TRICK_REPEAT_LIMIT + 2; use++) {
        const next = scoreTrickRepeat(state, kind, 5);
        state = next.state;
        gained.push(next.points);
      }
      expect(gained.slice(0, TRICK_REPEAT_LIMIT).every((points) => points === 5)).toBe(true);
      expect(gained[TRICK_REPEAT_LIMIT]).toBe(0);
      expect(gained[TRICK_REPEAT_LIMIT + 1]).toBe(0);
      expect(trickRepeatLeft(state)).toBe(0);
      expect(trickRepeatText(kind, trickRepeatLeft(state))).toContain('x0 left');
    }
  });

  it('a different trick starts the allowance again', () => {
    let state = emptyTrickRepeat();
    for (let use = 0; use < TRICK_REPEAT_LIMIT; use++) state = scoreTrickRepeat(state, 'thigh', 2).state;
    const reset = scoreTrickRepeat(state, 'header', 3);
    expect(reset.points).toBe(3);
    expect(reset.state).toEqual({ kind: 'header', count: 1 });
    expect(trickRepeatLeft(reset.state)).toBe(9);
    expect(trickRepeatText('thigh', 7)).toBe('Thigh kick x7 left');
  });
});

describe('engine scores obey the repeat cap', () => {
  it('headers score ten times and the next ones add nothing to the submitted total', () => {
    const e = started();
    const gained = Array.from({ length: 12 }, () => header(e));
    expect(gained.slice(0, 10).every((points) => points > 0)).toBe(true);
    expect(gained[10]).toBe(0);
    expect(gained[11]).toBe(0);
    expect(e.stats.headers).toBe(12);
    expect(e.trickRepeat).toEqual({ kind: 'header', count: 10 });
    const capped = e.stats.score;
    const neckBefore = e.stats.score;
    fallThrough(e, e.config.contacts.nape.y, e.config.contacts.nape.z, 8);
    e.pressNeck();
    expect(e.stats.score).toBeGreaterThan(neckBefore);
    expect(e.trickRepeat).toEqual({ kind: 'neckStall', count: 1 });
    expect(header(e)).toBeGreaterThan(0);
    expect(e.stats.score).toBeGreaterThan(capped);
  });

  it('a thigh kick is capped the same way, and a plain kick does not reset it', () => {
    const e = started();
    const gained = Array.from({ length: 11 }, () => thigh(e));
    expect(gained.slice(0, 10).every((points) => points > 0)).toBe(true);
    expect(gained[10]).toBe(0);
    expect(e.stats.thighs).toBe(11);
    expect(e.trickRepeat.kind).toBe('thigh');
    const between = foot(e);
    expect(between).toBeGreaterThan(0);
    expect(e.trickRepeat).toEqual({ kind: 'thigh', count: 10 });
    const beforeRepeat = e.stats.score;
    const repeat = thigh(e);
    // The thigh award is 0. A foot in between can still complete the variety chain.
    expect(repeat).toBe(e.config.scoring.varietyBonus);
    expect(e.stats.score - beforeRepeat).toBe(e.config.scoring.varietyBonus);
    expect(e.trickRepeat).toEqual({ kind: 'thigh', count: 10 });
    const beforeHeader = e.stats.score;
    expect(header(e)).toBeGreaterThan(0);
    expect(e.stats.score).toBeGreaterThan(beforeHeader);
    expect(thigh(e)).toBeGreaterThan(0);
  });

  it('high flicks, grooves and around-the-world stop paying after ten', () => {
    const flick = started();
    const flicks: number[] = [];
    for (let use = 0; use < 11; use++) {
      const before = flick.stats.score;
      flick.setTrick('highFlick');
      runUntilContactDelta(flick, 8);
      flick.press('left');
      flick.release('left');
      stepN(flick, 8);
      flicks.push(flick.stats.score - before);
    }
    expect(flicks.slice(0, 10).every((points) => points > 0)).toBe(true);
    expect(flicks[10]).toBe(0);
    expect(flick.stats.highFlicks).toBe(11);

    const spin = started();
    const spins: number[] = [];
    for (let use = 0; use < 11; use++) {
      const before = spin.stats.score;
      spin.setTrick('aroundTheWorld');
      runUntilContactDelta(spin, 8);
      spin.press('right');
      spin.release('right');
      for (let i = 0; i < 4000 && spin.stats.aroundTheWorlds === use && spin.phase === 'playing'; i++) {
        spin.step(spin.config.fixedStep);
      }
      spins.push(spin.stats.score - before);
      for (let i = 0; i < 80 && spin.trick; i++) spin.step(spin.config.fixedStep);
    }
    expect(spins.slice(0, 10).every((points) => points > 0)).toBe(true);
    expect(spins[10]).toBe(0);
    expect(spin.stats.aroundTheWorlds).toBe(11);

    const dance = started();
    const grooves: number[] = [];
    for (let use = 0; use < 11; use++) {
      const before = dance.stats.score;
      dance.setTrick('groove');
      runUntilContactDelta(dance, 8);
      dance.press('left');
      dance.release('left');
      stepN(dance, 8);
      grooves.push(dance.stats.score - before);
      for (let i = 0; i < 400 && dance.trick; i++) dance.step(dance.config.fixedStep);
    }
    expect(grooves.slice(0, 10).every((points) => points > 0)).toBe(true);
    expect(grooves[10]).toBe(0);
    expect(dance.stats.grooves).toBe(11);
  });

  it('a new run starts the allowance over', () => {
    const e = started();
    for (let use = 0; use < 10; use++) header(e);
    expect(header(e)).toBe(0);
    e.prepare('ready');
    e.press('left');
    e.release('left');
    expect(e.trickRepeat).toEqual({ kind: null, count: 0 });
    expect(e.stats.score).toBe(0);
    expect(header(e)).toBeGreaterThan(0);
  });
});
