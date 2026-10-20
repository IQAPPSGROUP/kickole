import { describe, expect, it } from 'vitest';
import { GameEngine } from '../engine/engine';
import { computePose } from './pose';
import { V2_LIMBS } from './limbCalibration';

function stepN(e: GameEngine, n: number) {
  for (let i = 0; i < n; i++) e.step(e.config.fixedStep);
}

function started() {
  const e = new GameEngine();
  e.prepare('ready');
  e.press('left'); e.release('left');
  return e;
}

function fallThrough(e: GameEngine, height: number, z: number) {
  e.ball.y = height + 0.7; e.ball.vy = 0; e.ball.vx = 0; e.ball.vz = 0; e.ball.x = 0; e.ball.z = z;
  for (let i = 0; i < 100000; i++) {
    if (e.ball.vy < 0 && e.timingDeltaMs(height) <= 8) return;
    e.step(e.config.fixedStep);
  }
  throw new Error('no window');
}

describe('trick poses', () => {
  it('uses calibrated limb lengths from the v2 model', () => {
    expect(V2_LIMBS.thigh).toBeGreaterThan(0.4);
    expect(V2_LIMBS.shin).toBeGreaterThan(0.4);
    expect(V2_LIMBS.hipX).toBeGreaterThan(0.1);
  });

  it('locks motion and softens knees for a header hit', () => {
    const e = started();
    e.setTrick('header');
    fallThrough(e, e.config.contacts.forehead.y, e.config.contacts.forehead.z);
    e.attemptHeader();
    const pose = computePose(e);
    expect(pose.lockMotion).toBe(true);
    expect(pose.legs.left.knee + pose.legs.right.knee).toBeGreaterThan(0.2);
    expect(pose.headPitch).toBeLessThan(-0.5);
    expect(pose.bodyY).toBeGreaterThan(0.02);
  });

  it('neck stall hinges forward with arms open and locks tracking', () => {
    const e = started();
    fallThrough(e, e.config.contacts.nape.y, e.config.contacts.nape.z);
    e.pressNeck();
    expect(e.trick?.kind).toBe('neckStall');
    stepN(e, 8);
    const pose = computePose(e);
    expect(pose.lockMotion).toBe(true);
    expect(pose.torsoPitch).toBeGreaterThan(0.3);
    expect(pose.neckPitch).toBeGreaterThan(0.2);
    expect(pose.armLeft).toBeGreaterThan(0.6);
    expect(pose.armRight).toBeGreaterThan(0.6);
    expect(pose.headYaw).toBe(0);
  });

  it('ATW keeps a bent knee and a planted support foot while the foot circles', () => {
    const e = started();
    e.setTrick('aroundTheWorld');
    for (let i = 0; i < 100000; i++) {
      if (e.ball.vy < 0 && e.timingDeltaMs() <= 5) break;
      e.step(e.config.fixedStep);
    }
    e.press('left'); e.release('left');
    stepN(e, Math.ceil(e.config.tricks.atwRevolutionTime / e.config.fixedStep * 0.5));
    const pose = computePose(e);
    expect(pose.lockMotion).toBe(true);
    expect(pose.legs.left.knee).toBeGreaterThan(0.4);
    expect(pose.legs.left.knee).toBeLessThan(1.2);
    expect(Math.abs(pose.legs.left.twist)).toBeLessThan(0.45);
    expect(pose.legs.left.thigh).toBeLessThan(-0.8);
    expect(Math.abs(pose.legs.right.thigh)).toBeLessThan(0.2);
  });

  it('thigh raise keeps the support foot near rest', () => {
    const e = started();
    e.setTrick('thigh');
    fallThrough(e, e.config.contacts.thigh.y, e.config.contacts.thigh.z);
    e.press('right');
    expect(e.contact?.thigh).toBe(true);
    stepN(e, 4);
    const pose = computePose(e);
    expect(pose.legs.right.thigh).toBeLessThan(-0.1);
    expect(Math.abs(pose.legs.left.thigh)).toBeLessThan(0.2);
  });

  it('samples the same pose at a paused engine time', () => {
    const e = started();
    e.trick = {
      kind: 'neckStall', phase: 'execute', side: null, startedAt: e.time - 0.4,
      awarded: true, revolution: 0, held: 0.4,
    };
    e.ball.y = e.config.contacts.nape.y; e.ball.z = e.config.contacts.nape.z;
    const a = computePose(e);
    const b = computePose(e);
    expect(a.torsoPitch).toBeCloseTo(b.torsoPitch, 8);
    expect(a.neckPitch).toBeCloseTo(b.neckPitch, 8);
    expect(a.lockMotion).toBe(true);
  });

  it('dances through a groove and is back in a ready stance while the ball is still up', () => {
    const e = started();
    e.equippedDance = 'shuffle';
    e.setTrick('groove');
    fallThrough(e, e.config.contactHeight, e.config.ballZ);
    e.press('right');
    e.release('right');
    stepN(e, Math.ceil(e.config.contactDelay / e.config.fixedStep) + 3);
    const dancing = computePose(e);
    expect(e.trick?.kind).toBe('groove');
    expect(dancing.lockMotion).toBe(true);
    expect(dancing.legs.left.knee).toBeLessThan(0.5);
    expect(dancing.legs.right.knee).toBeLessThan(0.5);
    expect(dancing.legs.left.thigh).toBeGreaterThan(-0.4);
    let apex = e.ball.y;
    for (let i = 0; i < 4000 && e.trick; i++) {
      e.step(e.config.fixedStep);
      apex = Math.max(apex, e.ball.y);
    }
    expect(e.trick).toBeNull();
    expect(apex - e.config.contactHeight).toBeGreaterThan(3);
    expect(e.ball.vy).toBeGreaterThan(0);
    expect(e.phase).toBe('playing');
    const ready = computePose(e);
    expect(ready.lockMotion).toBe(false);
    expect(Math.abs(ready.legs.left.thigh)).toBeLessThan(0.35);
    expect(Math.abs(ready.legs.right.thigh)).toBeLessThan(0.35);
  });
});
