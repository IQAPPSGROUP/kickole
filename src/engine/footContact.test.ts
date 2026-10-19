import { describe, expect, it } from 'vitest';
import { ballOnBoot } from './footContact';

describe('ballOnBoot', () => {
  it('puts the leather on the boot point and keeps the ball on the approach side', () => {
    const boot = { x: -0.08, y: 0.66, z: 0.44 };
    const approach = { x: -0.1, y: 0.72, z: 0.62 };
    const radius = 0.14;
    const center = ballOnBoot(boot, approach, radius);
    const gap = Math.hypot(center.x - boot.x, center.y - boot.y, center.z - boot.z) - radius;
    expect(gap).toBeCloseTo(0, 6);
    expect(center.z).toBeGreaterThan(boot.z);
    expect(center.y).toBeGreaterThan(boot.y);
  });

  it('lifts the ball off a boot that is already at the approach point', () => {
    const boot = { x: 0.1, y: 0.7, z: 0.5 };
    const center = ballOnBoot(boot, boot, 0.14);
    expect(center).toEqual({ x: boot.x, y: boot.y + 0.14, z: boot.z });
  });
});
