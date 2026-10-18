import { describe, expect, it } from 'vitest';
import { sambaRate, easeSamba, SAMBA_MAX, SAMBA_MIN } from './samba';

describe('sambaRate', () => {
  it('stays at 1 until a perfect streak starts, then caps at 1.35', () => {
    expect(sambaRate(0)).toBe(SAMBA_MIN);
    expect(sambaRate(-2)).toBe(1);
    expect(sambaRate(1)).toBeCloseTo(1.05);
    expect(sambaRate(7)).toBe(SAMBA_MAX);
    expect(sambaRate(20)).toBe(1.35);
  });

  it('eases back toward 1 instead of jumping', () => {
    let rate = 1.35;
    rate = easeSamba(rate, sambaRate(0));
    expect(rate).toBeLessThan(1.35);
    expect(rate).toBeGreaterThan(1);
    for (let i = 0; i < 20; i++) rate = easeSamba(rate, 1);
    expect(rate).toBe(1);
  });
});
