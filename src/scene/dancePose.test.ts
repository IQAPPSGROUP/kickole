import { describe, expect, it } from 'vitest';
import { createPose } from './pose';
import { accentGrooveTouch, applyDancePose, applySambaStep } from './dancePose';
import type { DanceId } from '../game/dances';

const IDS: DanceId[] = ['sway', 'pendulum', 'shuffle', 'heelrock'];

describe('dance poses', () => {
  it('keeps the four dances distinct and unlike copied moves', () => {
    const poses = IDS.map((id) => {
      const pose = createPose();
      applyDancePose(pose, id, 0.02, 1);
      return pose;
    });
    expect(poses.every((pose) => pose.lockMotion)).toBe(true);
    const signatures = poses.map((pose) => [
      pose.armLeft.toFixed(3),
      pose.armRight.toFixed(3),
      pose.legs.left.knee.toFixed(3),
      pose.bodyYaw.toFixed(3),
      pose.elbowLeft.toFixed(3),
    ].join(','));
    expect(new Set(signatures).size).toBe(4);

    for (const id of ['sway', 'shuffle'] as const) {
      const pose = createPose();
      applyDancePose(pose, id, 0.25, 1);
      expect(pose.legs.left.knee).toBeLessThan(0.5);
      expect(pose.legs.right.knee).toBeLessThan(0.5);
    }
    const shuffle = createPose();
    applyDancePose(shuffle, 'shuffle', 0.1, 1);
    expect(shuffle.armLeft).toBeLessThan(0.8);
    expect(shuffle.armRight).toBeLessThan(0.8);

    const pendulum = createPose();
    applyDancePose(pendulum, 'pendulum', 0.3, 1);
    expect(pendulum.elbowLeft).toBeLessThan(0.6);
    expect(pendulum.elbowRight).toBeLessThan(0.6);

    const rock = createPose();
    applyDancePose(rock, 'heelrock', 0.25, 1);
    expect(Math.abs(rock.bodyYaw)).toBeLessThan(1);
    expect(rock.elbowLeft).toBeGreaterThan(0.8);
    expect(rock.armLeft).toBeLessThan(1.2);
  });

  it('mirrors the samba step on opposite beats', () => {
    const left = createPose();
    const right = createPose();
    applySambaStep(left, 0.25, 1);
    applySambaStep(right, 0.75, 1);
    expect(left.armLeftPitch).toBeGreaterThan(0.4);
    expect(right.armLeftPitch).toBeLessThan(-0.4);
    expect(left.legs.left.knee).toBeGreaterThan(left.legs.right.knee + 0.25);
    expect(right.legs.right.knee).toBeGreaterThan(right.legs.left.knee + 0.25);
    expect(left.elbowLeft).toBeGreaterThan(0.6);
  });

  it('shrinks the motion when intensity is reduced', () => {
    const full = createPose();
    const small = createPose();
    applyDancePose(full, 'shuffle', 0.1, 1);
    applyDancePose(small, 'shuffle', 0.1, 0.35);
    expect(Math.abs(small.torsoRoll)).toBeLessThan(Math.abs(full.torsoRoll));
  });

  it('accents a knee touch without moving the other leg the same way', () => {
    const pose = createPose();
    applyDancePose(pose, 'sway', 0.5, 1);
    accentGrooveTouch(pose, 'left', 'knee', 1);
    expect(pose.legs.left.knee).toBeGreaterThan(pose.legs.right.knee);
    accentGrooveTouch(pose, 'right', 'chest', 1);
    expect(pose.torsoPitch).toBeGreaterThan(0.1);
  });
});
