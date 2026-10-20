import { describe, expect, it } from 'vitest';
import {
  colorSaturation,
  contrastCurve,
  depthOfFieldActive,
  depthOfFieldFocus,
  depthOfFieldScale,
  gradeDisplayColor,
  rec709Luma,
} from './presentation';

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
    expect(depthOfFieldScale('menu', false).aperture).toBeGreaterThan(0.005);
    expect(depthOfFieldScale('menu', false).maxblur).toBeGreaterThan(0.02);
    expect(depthOfFieldScale('menu', false).aperture).toBeGreaterThan(depthOfFieldScale('over', false).aperture);
    expect(depthOfFieldScale('playing', true).maxblur).toBeGreaterThan(depthOfFieldScale('over', false).maxblur);
  });

  it('warms the highlights and keeps blacks deep', () => {
    const [red, green, blue] = gradeDisplayColor(0.62, 0.48, 0.4);
    expect(red).toBeGreaterThan(blue);
    expect(red).toBeGreaterThan(0.4);
    expect(green).toBeGreaterThan(0.3);
    expect(blue).toBeGreaterThan(0.2);
    const black = gradeDisplayColor(0, 0, 0);
    expect(black.every((channel) => channel < 0.03)).toBe(true);
    const white = gradeDisplayColor(1, 1, 1);
    expect(white.every((channel) => channel <= 1 && channel >= 0.92)).toBe(true);
  });

  it('spreads mid greys with a gentle S-curve', () => {
    const dark = contrastCurve(0.22);
    const light = contrastCurve(0.72);
    expect(dark).toBeLessThan(0.22);
    expect(light).toBeGreaterThan(0.72);
    expect(light - dark).toBeGreaterThan(0.72 - 0.22);
    const gradedDark = rec709Luma(...gradeDisplayColor(0.22, 0.22, 0.22));
    const gradedLight = rec709Luma(...gradeDisplayColor(0.72, 0.72, 0.72));
    expect(gradedLight - gradedDark).toBeGreaterThan(0.5);
  });

  it('raises saturation on carnival pink, teal and yellow', () => {
    const carnival = [
      [0.86, 0.38, 0.52],
      [0.18, 0.62, 0.58],
      [0.92, 0.78, 0.22],
    ] as const;
    for (const [r, g, b] of carnival) {
      const graded = gradeDisplayColor(r, g, b);
      expect(colorSaturation(...graded)).toBeGreaterThan(colorSaturation(r, g, b));
    }
    const skin = gradeDisplayColor(0.72, 0.5, 0.4);
    const skinLuma = rec709Luma(...skin);
    expect(skinLuma).toBeGreaterThan(0.35);
    expect(skinLuma).toBeLessThan(0.72);
    expect(colorSaturation(...skin)).toBeGreaterThan(0.25);
  });
});
