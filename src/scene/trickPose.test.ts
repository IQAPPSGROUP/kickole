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
    expect(Math.abs(pose.headPitch)).toBeLessThan(0.55);
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

  it('ATW circles the active foot with hip twist while planting the support foot', () => {
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
    expect(Math.abs(pose.legs.left.twist)).toBeGreaterThan(0.2);
    expect(Math.abs(pose.legs.right.thigh)).toBeLessThan(0.2);
    expect(pose.legs.left.knee).toBeGreaterThan(0.05);
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
});
