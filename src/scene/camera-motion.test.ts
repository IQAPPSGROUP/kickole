import { describe, expect, it } from 'vitest';
import { cameraKickFor, celebrateOffset } from './camera-motion';

describe('cameraKickFor', () => {
  const perfect = { grade: 'perfect' as const, stall: false, alternate: false, streak: 1, side: 'left' as const };

  it('keeps a readable push on Low and drops the shake', () => {
    const low = cameraKickFor(perfect, 'low');
    const high = cameraKickFor(perfect, 'high');
    expect(low.push).toBeGreaterThan(0.5);
    expect(low.shake).toBe(0);
    expect(low.celebrate).toBeGreaterThan(0.5);
    expect(high.shake).toBeGreaterThan(0);
  });

  it('leans to the kicking side and opens up on a stall or a tenth kick', () => {
    expect(cameraKickFor({ ...perfect, side: 'right' }, 'medium').sway).toBeGreaterThan(0);
    expect(cameraKickFor({ ...perfect, side: 'left' }, 'medium').sway).toBeLessThan(0);
    const stall = cameraKickFor({ grade: 'good', stall: true, alternate: false, streak: 2, side: 'right' }, 'high');
    expect(stall.celebrate).toBeGreaterThan(0.4);
    const tenth = cameraKickFor({ ...perfect, streak: 10 }, 'high');
    expect(tenth.celebrate).toBeGreaterThan(cameraKickFor(perfect, 'high').celebrate);
    expect(tenth.shake).toBeGreaterThan(cameraKickFor(perfect, 'high').shake);
  });
});

describe('celebrateOffset', () => {
  it('is still when nothing is being celebrated', () => {
    expect(celebrateOffset(0, 1, 'high')).toEqual({ yaw: 0, lift: 0, dolly: 0 });
  });

  it('uses a smaller orbit on Low than on High', () => {
    const low = celebrateOffset(1, 0.4, 'low');
    const high = celebrateOffset(1, 0.4, 'high');
    expect(Math.abs(high.yaw)).toBeGreaterThan(Math.abs(low.yaw));
    expect(high.lift).toBeGreaterThan(low.lift);
  });
});
