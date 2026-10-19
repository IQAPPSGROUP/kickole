import { describe, expect, it } from 'vitest';
import { GameEngine } from './engine';
import { impulseForApex } from './tricks';

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

/** Place the ball above a contact height so it descends through the timing window. */
function fallThrough(e: GameEngine, height: number, z: number, targetMs = 10) {
  e.ball.y = height + 0.7;
  e.ball.vy = 0;
  e.ball.vx = 0;
  e.ball.vz = 0;
  e.ball.x = 0;
  e.ball.z = z;
  runUntilContactDelta(e, targetMs, height);
}

describe('classic foot juggling unchanged without a trick', () => {
  it('scores a perfect kick the same as before', () => {
    const e = started();
    runUntilContactDelta(e, 10);
    e.press('right');
    e.release('right');
    stepN(e, 5);
    expect(e.stats.kickUps).toBe(1);
    expect(e.stats.score).toBe(1 + 2);
    expect(e.stats.headers).toBe(0);
  });

  it('foot stall still awards +10', () => {
    const e = started();
    runUntilContactDelta(e, 5);
    e.press('left');
    stepN(e, 60);
    expect(e.contact?.kind).toBe('stall');
    e.release('left');
    expect(e.stats.score).toBe(1 + 2 + 10);
  });
});

describe('high flick', () => {
  it('derives impulse from apex and gravity, not by raising kickSpeed', () => {
    const e = started();
    e.setTrick('highFlick');
    runUntilContactDelta(e, 5);
    const gAtFlick = e.gravity;
    let flickVy = 0;
    e.on((ev) => { if (ev.type === 'kick') flickVy = e.ball.vy; });
    e.press('right');
    e.release('right');
    stepN(e, 8);
    const expected = impulseForApex(e.config.highFlickApex, e.config.contactHeight, gAtFlick);
    expect(flickVy).toBeCloseTo(expected, 5);
    expect(flickVy).toBeGreaterThan(e.config.kickSpeed);
    expect(e.stats.score).toBe(1 + 2); // no extra trick bonus
    expect(e.stats.highFlicks).toBe(1);
    expect(e.selectedTrick).toBeNull();
  });

  it('still clears forehead height at maximum gravity', () => {
    const e = started();
    // Ramp gravity to the cap via many normal kicks.
    for (let k = 0; k < 80 && e.gravity < e.config.gravity * e.config.maxGravityScale - 1e-6; k++) {
      runUntilContactDelta(e, 5);
      const side = k % 2 === 0 ? 'right' : 'left';
      e.press(side); e.release(side);
      stepN(e, 8);
    }
    expect(e.gravity).toBeCloseTo(e.config.gravity * e.config.maxGravityScale, 5);
    expect(e.contact).toBeNull();
    expect(e.setTrick('highFlick')).toBe(true);
    runUntilContactDelta(e, 5);
    e.press('left'); e.release('left');
    stepN(e, 8);
    expect(e.stats.highFlicks).toBe(1);
    let apex = e.ball.y;
    for (let i = 0; i < 800 && e.ball.vy > 0; i++) {
      e.step(e.config.fixedStep);
      apex = Math.max(apex, e.ball.y);
    }
    expect(apex).toBeGreaterThan(e.config.contacts.forehead.y + e.config.ballRadius);
  });
});

describe('header', () => {
  it('requires a descending ball near the forehead and awards +3 once', () => {
    const e = started();
    e.setTrick('header');
    fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z, 8);
    const beforeKick = e.stats.kickUps;
    e.press('left');
    expect(e.stats.headers).toBe(1);
    expect(e.stats.score).toBeGreaterThanOrEqual(3);
    expect(e.stats.kickUps).toBe(beforeKick);
    expect(e.lastKick.left).toBeLessThan(e.time - 0.01); // not recorded as a foot kick on this tap
    expect(e.lastTrick?.kind).toBe('header');
    const scored = e.stats.score;
    // Farming: second press while recovering / no window does not re-award.
    e.press('right');
    expect(e.stats.headers).toBe(1);
    expect(e.stats.score).toBe(scored);
  });

  it('rejects headers while the ball is still rising', () => {
    const e = started();
    stepN(e, 10);
    expect(e.ball.vy).toBeGreaterThan(0);
    e.setTrick('header');
    const fails: string[] = [];
    e.on((ev) => { if (ev.type === 'trickFail') fails.push(ev.reason); });
    e.press('left');
    expect(e.stats.headers).toBe(0);
    expect(fails).toContain('window');
  });
});

describe('neck stall', () => {
  it('catches on the nape, holds, then flicks without foot kick records', () => {
    const e = started();
    fallThrough(e, e.config.contacts.nape.y, e.config.contacts.nape.z, 5);
    e.pressNeck();
    expect(e.stats.neckStalls).toBe(1);
    expect(e.stats.score).toBe(10);
    expect(e.trick?.kind).toBe('neckStall');
    const y = e.ball.y;
    stepN(e, 40);
    expect(e.ball.y).toBeCloseTo(y, 5);
    expect(e.ball.y).toBeCloseTo(e.config.contacts.nape.y, 5);
    e.releaseNeck();
    expect(e.ball.vy).toBeGreaterThan(0);
    expect(e.stats.score).toBe(10); // hold/release does not farm
    expect(e.stats.kickUps).toBe(0);
  });

  it('auto-flicks at the max hold duration', () => {
    const e = started();
    fallThrough(e, e.config.contacts.nape.y, e.config.contacts.nape.z, 5);
    e.pressNeck();
    const maxSteps = Math.ceil(e.config.tricks.neckMaxHold / e.config.fixedStep) + 5;
    stepN(e, maxSteps);
    expect(e.ball.vy).toBeGreaterThan(0);
    expect(e.trick?.phase === 'recover' || e.trick === null).toBe(true);
  });
});

describe('around the world', () => {
  it('does not complete on the initial pop alone', () => {
    const e = started();
    e.setTrick('aroundTheWorld');
    runUntilContactDelta(e, 5);
    e.press('left'); e.release('left');
    stepN(e, 5);
    expect(e.stats.aroundTheWorlds).toBe(0);
    expect(e.stats.score).toBe(0);
    expect(e.trick?.kind).toBe('aroundTheWorld');
    expect(e.trick?.phase).toBe('execute');
  });

  it('awards +20 only after revolution and a timed return touch', () => {
    const e = started();
    e.setTrick('aroundTheWorld');
    runUntilContactDelta(e, 5);
    e.press('left'); e.release('left');
    // Wait for a full revolution.
    const need = Math.ceil(e.config.tricks.atwRevolutionTime / e.config.fixedStep) + 2;
    stepN(e, need);
    expect(e.trick?.phase).toBe('recover');
    expect(e.trick?.revolution).toBeGreaterThanOrEqual(1);
    runUntilContactDelta(e, 5);
    e.press('right'); e.release('right');
    expect(e.stats.aroundTheWorlds).toBe(1);
    expect(e.stats.score).toBeGreaterThanOrEqual(1 + 20);
    expect(e.trick).toBeNull();
  });

  it('duplicate taps during the revolution do not finish or farm points', () => {
    const e = started();
    e.setTrick('aroundTheWorld');
    runUntilContactDelta(e, 5);
    e.press('left'); e.release('left');
    e.press('right'); e.release('right');
    e.press('left'); e.release('left');
    expect(e.stats.aroundTheWorlds).toBe(0);
    expect(e.stats.score).toBe(0);
  });
});

describe('thigh touch', () => {
  it('uses thigh height and awards +2 once', () => {
    const e = started();
    e.setTrick('thigh');
    fallThrough(e, e.config.contacts.thigh.y, e.config.contacts.thigh.z, 8);
    e.press('left'); e.release('left');
    stepN(e, 5);
    expect(e.stats.thighs).toBe(1);
    expect(e.stats.kickUps).toBe(1);
    expect(e.stats.score).toBe(1 + 2 + 2); // kickUp + perfect + thigh
    expect(e.ball.vy).toBeGreaterThan(0);
  });
});

describe('trick safety and determinism', () => {
  it('rejects conflicting trick selection while a foot trap is active', () => {
    const e = started();
    runUntilContactDelta(e, 5);
    e.press('left');
    expect(e.setTrick('header')).toBe(false);
    expect(e.selectedTrick).toBeNull();
  });

  it('failed tricks leave the ball airborne for recovery', () => {
    const e = started();
    // Loft well above the forehead, then tap far too early.
    e.ball.y = e.config.contacts.forehead.y + 1.4;
    e.ball.vy = 0;
    e.ball.z = e.config.contacts.forehead.z;
    e.ball.x = 0;
    stepN(e, 5);
    e.setTrick('header');
    e.press('left');
    expect(e.stats.headers).toBe(0);
    expect(e.phase).toBe('playing');
    expect(e.ball.y).toBeGreaterThan(e.config.contacts.forehead.y);
    // Recover with a normal foot kick after the ball comes down.
    e.setTrick(null);
    runUntilContactDelta(e, 5);
    e.press('right'); e.release('right');
    stepN(e, 8);
    expect(e.stats.kickUps).toBe(1);
  });

  it('is deterministic across render chunk sizes', () => {
    const run = (chunk: number) => {
      const e = new GameEngine();
      e.prepare('ready');
      e.press('left'); e.release('left');
      e.setTrick('highFlick');
      let guard = 0;
      while (e.ball.vy >= 0 && guard++ < 5000) e.update(chunk);
      while (e.timingDeltaMs() > 5 && guard++ < 20000) e.update(chunk);
      e.press('right'); e.release('right');
      e.update(chunk);
      return { score: e.stats.score, vy: e.ball.vy, y: e.ball.y, high: e.stats.highFlicks };
    };
    expect(run(1 / 60)).toEqual(run(1 / 144));
  });

  it('restart clears trick state and stats', () => {
    const e = started();
    e.setTrick('header');
    fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z, 8);
    e.press('left');
    expect(e.stats.headers).toBe(1);
    e.prepare('ready');
    expect(e.stats.headers).toBe(0);
    expect(e.selectedTrick).toBeNull();
    expect(e.trick).toBeNull();
    expect(e.celebration).toBeNull();
  });
});

describe('groove trick', () => {
  it('pops the ball and pays the on-beat bonus without leaving groove', () => {
    const e = started();
    expect(e.armTrick('groove')).toBe(true);
    e.setBeatGrade('perfect');
    fallThrough(e, e.config.contacts.chest.y, e.config.contacts.chest.z, 20);
    e.press('left');
    expect(e.stats.grooves).toBe(1);
    expect(e.stats.score).toBe(e.config.scoring.groove + e.config.scoring.grooveBeatPerfect);
    expect(e.ball.vy).toBeGreaterThan(1);
    expect(e.selectedTrick).toBe('groove');
    expect(e.stats.kickUps).toBe(0);
  });

  it('still scores the touch when the tap misses the beat', () => {
    const e = started();
    e.setTrick('groove');
    e.setBeatGrade('off');
    fallThrough(e, e.config.contacts.thigh.y, e.config.contacts.thigh.z, 15);
    e.press('right');
    expect(e.stats.grooves).toBe(1);
    expect(e.stats.score).toBe(e.config.scoring.groove);
    expect(e.lastBeatGrade).toBe('off');
  });

  it('leaves classic kicks alone until groove is armed', () => {
    const e = started();
    runUntilContactDelta(e, 8);
    e.press('right');
    e.release('right');
    stepN(e, 6);
    expect(e.stats.kickUps).toBe(1);
    expect(e.stats.grooves).toBe(0);
  });
});

describe('milestone celebration', () => {
  it('holds the ball, can be skipped, and leaves a catchable descent', () => {
    const e = started();
    e.ball.y = 1.4;
    e.ball.vy = 1.2;
    e.ball.vx = 0.4;
    e.startCelebration('samba', 'streak:10', 0.5);
    const held = e.ball.y;
    stepN(e, 8);
    expect(e.celebration?.danceId).toBe('samba');
    expect(e.ball.y).toBeCloseTo(held, 5);
    expect(e.ball.vy).toBe(0);
    expect(e.skipCelebration()).toBe(true);
    expect(e.celebration).toBeNull();
    expect(e.ball.vy).toBeLessThan(0);
    expect(e.ball.y).toBeGreaterThan(e.config.contactHeight);
    expect(e.phase).toBe('playing');
  });

  it('ends itself and ignores a second dance until the first finishes', () => {
    const e = started();
    e.startCelebration('robot', 'juggle:10', 0.15);
    e.startCelebration('spin', 'perfect:50', 2);
    expect(e.celebration?.danceId).toBe('robot');
    stepN(e, Math.ceil(0.2 / e.config.fixedStep) + 2);
    expect(e.celebration).toBeNull();
    expect(e.phase).toBe('playing');
    expect(e.ball.vy).toBeLessThan(0);
  });
});
