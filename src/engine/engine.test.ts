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
