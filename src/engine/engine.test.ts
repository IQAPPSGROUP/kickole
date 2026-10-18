import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';

function runUntilContactDelta(e: GameEngine, targetMs: number) {
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs() <= targetMs) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('never reached');
}

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

describe('GameEngine', () => {
  it('launches the ball on first tap', () => {
    const e = started();
    expect(e.phase).toBe('playing');
    stepN(e, 20);
    expect(e.ball.y).toBeGreaterThan(0.5);
  });

  it('is deterministic', () => {
    const run = () => { const e = started(); stepN(e, 300); return { ...e.ball }; };
    expect(run()).toEqual(run());
  });

  it('grades by configurable timing windows', () => {
    const e = new GameEngine({ timing: { perfectMs: 20, goodMs: 50, poorMs: 80 } });
    expect(e.gradeFor(15)).toBe('perfect');
    expect(e.gradeFor(-40)).toBe('good');
    expect(e.gradeFor(70)).toBe('poor');
    expect(e.gradeFor(100)).toBe('miss');
    const d = new GameEngine();
    expect(d.gradeFor(150)).toBe('poor');
  });

  it('scores a perfect kick with a bonus and keeps the ball up', () => {
    const e = started();
    runUntilContactDelta(e, 10);
    e.press('right');
    e.release('right');
    stepN(e, 5);
    expect(e.stats.kickUps).toBe(1);
    expect(e.stats.score).toBe(1 + 2);
    expect(e.ball.vy).toBeGreaterThan(0);
  });

  it('awards the alternating-foot bonus', () => {
    const e = started();
    runUntilContactDelta(e, 5); e.press('left'); e.release('left'); stepN(e, 5);
    const first = e.stats.score;
    runUntilContactDelta(e, 5); e.press('right'); e.release('right'); stepN(e, 5);
    expect(e.stats.score - first).toBe(1 + 2 + 3);
  });

  it('foot stall awards 10 extra points and flicks the ball back up', () => {
    const e = started();
    runUntilContactDelta(e, 5);
    e.press('left');
    stepN(e, 60);
    expect(e.contact?.kind).toBe('stall');
    e.release('left');
    expect(e.stats.score).toBe(1 + 2 + 10);
    expect(e.ball.vy).toBeGreaterThan(0);
  });

  it('ends the run when the ball hits the ground', () => {
    const e = started();
    for (let i = 0; i < 2000 && e.phase === 'playing'; i++) e.step(e.config.fixedStep);
    expect(e.phase).toBe('dropped');
    stepN(e, 400);
    expect(e.phase).toBe('over');
  });

  it('early taps are a miss and do not end the run', () => {
    const e = started();
    e.step(e.config.fixedStep);
    e.press('right');
    expect(e.phase).toBe('playing');
    expect(e.stats.kickUps).toBe(0);
  });
});

describe('input abuse', () => {
  it('rapid random mashing only scores kicks inside the timing window', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let run = 0; run < 20; run++) {
      const e = new GameEngine();
      const kicks: { deltaMs: number; points: number }[] = [];
      e.on((ev) => { if (ev.type === 'kick') kicks.push({ deltaMs: ev.deltaMs, points: ev.points }); });
      e.prepare('ready');
      for (let i = 0; i < 6000 && e.phase !== 'over'; i++) {
        const r = rnd();
        const side = rnd() < 0.5 ? 'left' : 'right';
        if (r < 0.15) e.press(side);
        else if (r < 0.3) e.release(side);
        e.step(e.config.fixedStep);
      }
      for (const k of kicks) expect(Math.abs(k.deltaMs)).toBeLessThanOrEqual(e.config.timing.poorMs + 1e-6);
      const total = kicks.reduce((s, k) => s + k.points, 0);
      expect(e.stats.score).toBeGreaterThanOrEqual(0);
      expect(e.stats.score).toBe(total);
    }
  });

  it('spamming early taps scores nothing and respects the miss cooldown', () => {
    const e = started();
    let misses = 0;
    e.on((ev) => { if (ev.type === 'miss') misses++; });
    for (let i = 0; i < 40; i++) {
      e.press('left'); e.release('left');
      e.press('right'); e.release('right');
      e.step(e.config.fixedStep);
    }
    expect(e.stats.score).toBe(0);
    expect(misses).toBeLessThanOrEqual(2);
  });

  it('inputs after the run ends do nothing', () => {
    const e = started();
    for (let i = 0; i < 5000 && e.phase !== 'over'; i++) e.step(e.config.fixedStep);
    const s = e.stats.score;
    e.press('left'); e.release('left'); e.press('right'); e.release('right');
    stepN(e, 100);
    expect(e.stats.score).toBe(s);
    expect(e.phase).toBe('over');
  });

  it('normal taps (held up to ~100 ms) never become a stall', () => {
    for (const holdSteps of [0, 1, 6, 12]) {
      const e = started();
      runUntilContactDelta(e, 5);
      e.press('left');
      stepN(e, holdSteps);
      e.release('left');
      stepN(e, 30);
      expect(e.stats.score, `hold ${holdSteps}`).toBe(1 + 2);
      expect(e.ball.vy).toBeGreaterThan(0);
    }
  });

  it('rapid alternating taps keep the run alive and score alternate bonuses', () => {
    const e = started();
    let side: 'left' | 'right' = 'right';
    for (let k = 0; k < 8; k++) {
      runUntilContactDelta(e, 5);
      e.press(side); e.release(side);
      stepN(e, 3);
      side = side === 'left' ? 'right' : 'left';
    }
    expect(e.phase).toBe('playing');
    expect(e.stats.score).toBeGreaterThan(8 * 3);
  });

  it('a stalled ball stays frozen while held', () => {
    const e = started();
    runUntilContactDelta(e, 5);
    e.press('right');
    stepN(e, 30);
    const y = e.ball.y, x = e.ball.x, z = e.ball.z;
    stepN(e, 30);
    expect([e.ball.x, e.ball.y, e.ball.z]).toEqual([x, y, z]);
  });
});
