import { describe, expect, it } from 'vitest';
import { createPose } from './pose';
import { accentGrooveTouch, applyDancePose } from './dancePose';

describe('dance poses', () => {
  it('makes samba, robot, griddy and spin distinct on the beat', () => {
    const poses = (['samba', 'robot', 'griddy', 'spin'] as const).map((id) => {
      const pose = createPose();
      applyDancePose(pose, id, 0.02, 1);
      return pose;
    });
    expect(poses.every((pose) => pose.lockMotion)).toBe(true);
    const signatures = poses.map((pose) => [
      pose.armLeft,
      pose.armRight,
      pose.legs.left.knee,
      pose.bodyYaw,
    ].join(','));
    expect(new Set(signatures).size).toBe(4);
    expect(poses[3].armLeft).toBeGreaterThan(2);
    expect(poses[1].elbowLeft).toBeGreaterThan(poses[0].elbowLeft);
  });

  it('shrinks the motion when intensity is reduced', () => {
    const full = createPose();
    const small = createPose();
    applyDancePose(full, 'griddy', 0.1, 1);
    applyDancePose(small, 'griddy', 0.1, 0.35);
    expect(Math.abs(small.torsoRoll)).toBeLessThan(Math.abs(full.torsoRoll));
  });

  it('accents a knee touch without moving the other leg the same way', () => {
    const pose = createPose();
    applyDancePose(pose, 'samba', 0.5, 1);
    accentGrooveTouch(pose, 'left', 'knee', 1);
    expect(pose.legs.left.knee).toBeGreaterThan(pose.legs.right.knee);
    accentGrooveTouch(pose, 'right', 'chest', 1);
    expect(pose.torsoPitch).toBeGreaterThan(0.1);
  });
});
