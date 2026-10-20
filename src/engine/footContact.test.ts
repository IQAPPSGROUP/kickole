import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { ballOnBoot, alignFootWindow } from './footContact';
import { normalKickApex } from './tricks';

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

  it('keeps the kick apex when the boot contact drops to knee height', () => {
    const config = {
      ...DEFAULT_CONFIG,
      contacts: { ...DEFAULT_CONFIG.contacts, foot: { ...DEFAULT_CONFIG.contacts.foot } },
    };
    const before = normalKickApex(config.contactHeight, config.kickSpeed, config.gravity);
    alignFootWindow(config, { x: -0.07, y: 0.32, z: 0.42 }, { x: 0.1, y: 0.32, z: 0.42 });
    const after = normalKickApex(config.contactHeight, config.kickSpeed, config.gravity);
    expect(config.contactHeight).toBeCloseTo(0.32, 5);
    expect(config.ballZ).toBeCloseTo(0.42, 5);
    expect(after).toBeCloseTo(before, 5);
    expect(config.kickSpeed).toBeGreaterThan(DEFAULT_CONFIG.kickSpeed);
  });

  it('lifts the ball off a boot that is already at the approach point', () => {
    const boot = { x: 0.1, y: 0.7, z: 0.5 };
    const center = ballOnBoot(boot, boot, 0.14);
    expect(center).toEqual({ x: boot.x, y: boot.y + 0.14, z: boot.z });
  });
});
