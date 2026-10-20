import { describe, expect, it } from 'vitest';
import { depthOfFieldActive, depthOfFieldFocus, depthOfFieldScale, gradeDisplayColor } from './presentation';

describe('presentation', () => {
  it('opens depth of field on the title, celebration and game over', () => {
    expect(depthOfFieldActive('menu', false)).toBe(true);
    expect(depthOfFieldActive('over', false)).toBe(true);
    expect(depthOfFieldActive('playing', true)).toBe(true);
    expect(depthOfFieldActive('playing', false)).toBe(false);
    expect(depthOfFieldActive('ready', false)).toBe(false);
    expect(depthOfFieldActive('dropped', true)).toBe(true);
  });

  it('focuses along the view toward the player and widens on the title', () => {
    expect(depthOfFieldFocus({ x: 0, y: 1.15, z: 8 }, { x: 0, y: 0, z: -1 })).toBeCloseTo(7.8);
    expect(depthOfFieldFocus({ x: 0, y: 1.15, z: 0.1 }, { x: 0, y: 0, z: 1 })).toBe(0.6);
    expect(depthOfFieldScale('menu', false).aperture).toBeGreaterThan(depthOfFieldScale('over', false).aperture);
    expect(depthOfFieldScale('playing', true).maxblur).toBeGreaterThan(depthOfFieldScale('over', false).maxblur);
  });

  it('warms the highlights without crushing a skin tone', () => {
    const [red, green, blue] = gradeDisplayColor(0.62, 0.48, 0.4);
    expect(red).toBeGreaterThan(blue);
    expect(red).toBeGreaterThan(0.4);
    expect(green).toBeGreaterThan(0.3);
    expect(blue).toBeGreaterThan(0.2);
    const [black] = gradeDisplayColor(0, 0, 0);
    expect(black).toBeGreaterThan(0);
    expect(black).toBeLessThan(0.08);
    const white = gradeDisplayColor(1, 1, 1);
    expect(white.every((channel) => channel <= 1 && channel >= 0)).toBe(true);
  });
});
