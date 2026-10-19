import { describe, expect, it } from 'vitest';
import { comboHeat, particleBudget, swoopStrength } from './juice';
import { kickToeClearance } from './kickClearance';

describe('graphics juice budgets', () => {
  it('caps particles by quality and cuts them further for reduced motion', () => {
    expect(particleBudget('high', false)).toBeLessThanOrEqual(72);
    expect(particleBudget('medium', false)).toBeLessThan(particleBudget('high', false));
    expect(particleBudget('low', false)).toBeLessThan(particleBudget('medium', false));
    expect(particleBudget('high', true)).toBeLessThanOrEqual(12);
    expect(particleBudget('low', true)).toBeGreaterThan(0);
  });

  it('heats the trail from pink through coral to gold', () => {
    expect(comboHeat(0).color).toBe('#FF4F9A');
    expect(comboHeat(8).color).toBe('#FF8A5B');
    expect(comboHeat(16).color).toBe('#FFD93D');
    expect(comboHeat(40).t).toBe(1);
    expect(comboHeat(12).opacity).toBeGreaterThan(comboHeat(1).opacity);
  });

  it('swoops on big combos and stays still when motion is reduced', () => {
    expect(swoopStrength(4, 0, false)).toBe(0);
    expect(swoopStrength(10, 0, false)).toBeGreaterThan(0);
    expect(swoopStrength(10, 0, true)).toBe(0);
    expect(swoopStrength(3, 5, false)).toBe(1);
  });

  it('lifts the toe only around the kick contact frame', () => {
    expect(kickToeClearance(0)).toBe(0);
    expect(kickToeClearance(0.3)).toBeGreaterThan(0.2);
    expect(kickToeClearance(0.26)).toBeGreaterThan(0);
    expect(kickToeClearance(0.3)).toBeGreaterThan(kickToeClearance(0.36));
  });
});
