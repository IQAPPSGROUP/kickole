import { describe, expect, it } from 'vitest';
import { shadowFocus } from './shadowFit';

describe('shadow focus', () => {
  it('stays on the player and only leans toward a nearby ball', () => {
    const near = shadowFocus({ x: 0, z: 0 }, { x: 0, z: 0.4 }, 3.2);
    expect(near[0]).toBe(0);
    expect(near[1]).toBeCloseTo(0.14);
    expect(shadowFocus({ x: 0, z: 0 }, { x: 8, z: -6 }, 3.2)).toEqual([0, 0]);
  });
});
