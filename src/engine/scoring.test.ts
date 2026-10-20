import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from './config';
import { streakMultiplier } from './scoring';

describe('streak multiplier', () => {
  it('stays at x1 until 10 clean touches, then steps up at 25 and 50', () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(9)).toBe(1);
    expect(streakMultiplier(10)).toBe(2);
    expect(streakMultiplier(24)).toBe(2);
    expect(streakMultiplier(25)).toBe(3);
    expect(streakMultiplier(49)).toBe(3);
    expect(streakMultiplier(50)).toBe(4);
    expect(streakMultiplier(80)).toBe(4);
  });

  it('pays more for a perfect touch than for switching feet', () => {
    expect(DEFAULT_CONFIG.scoring.perfectBonus).toBeGreaterThan(DEFAULT_CONFIG.scoring.alternateBonus);
  });
});
