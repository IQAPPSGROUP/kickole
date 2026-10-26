import type { Phase } from '../engine/engine';

/** The court stays sharp on the title and in play. Game over keeps a light hold. */
export function depthOfFieldActive(phase: Phase, celebrating: boolean): boolean {
  if (celebrating && phase === 'playing') return false;
  switch (phase) {
    case 'menu':
    case 'ready':
    case 'playing':
    case 'dropped':
      return false;
    case 'over':
      return true;
    default: {
      const neverPhase: never = phase;
      return neverPhase;
    }
  }
}

/** Focus distance along the camera's look direction, aimed at the player's chest. */
export function depthOfFieldFocus(
  cameraPosition: { x: number; y: number; z: number },
  forward: { x: number; y: number; z: number },
): number {
  const along = -cameraPosition.x * forward.x + (1.15 - cameraPosition.y) * forward.y + (0.2 - cameraPosition.z) * forward.z;
  return along > 0.6 ? along : 0.6;
}

/**
 * three r186 bokeh blur is `clamp((focus + viewZ) * aperture, ±maxblur)` in screen space.
 * The back wall is only a few metres behind the player, so this stays a hint.
 * A wider disk read as fog on the back wall.
 */
export function depthOfFieldScale(phase: Phase, celebrating: boolean): { aperture: number; maxblur: number } {
  if (phase === 'menu' || celebrating) return { aperture: 0.0014, maxblur: 0.005 };
  return { aperture: 0.0008, maxblur: 0.003 };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * How far the display S-curve pulls the quarters away from mid grey.
 * The previous grade used 0.9. 0.68 keeps black, white, and mid grey put
 * and cuts that extra pull by about a quarter (24%).
 */
export const DISPLAY_CONTRAST = 0.68;

/**
 * Contrast S-curve. Black, white, and mid grey stay put.
 * The quarters pull apart. The ends ease off so a bright pastel is not crushed to white.
 */
export function contrastCurve(value: number): number {
  const t = clamp01(value);
  const centered = t - 0.5;
  const falloff = Math.pow(Math.max(0, 1 - Math.abs(centered) * 2), 1.15);
  return clamp01(t + centered * DISPLAY_CONTRAST * falloff);
}

function vibrate(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const chroma = max <= 1e-5 ? 0 : (max - min) / max;
  const wanted = 1.42 + 0.7 * (1 - chroma);
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const span = max - luma;
  const room = span > 1e-5 ? (1 - luma) / span : wanted;
  const sat = Math.min(wanted, Math.max(1, room));
  return [
    luma + (r - luma) * sat,
    luma + (g - luma) * sat,
    luma + (b - luma) * sat,
  ];
}

/**
 * Display grade after AgX. Vibrance runs first so pastel walls gain chroma.
 * The S-curve then moves luma only, so it does not lift mid grey
 * or crush those colours back to white.
 */
export function gradeDisplayColor(r: number, g: number, b: number): [number, number, number] {
  let [red, green, blue] = vibrate(r, g, b);
  const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const curved = contrastCurve(luma);
  const peak = Math.max(red, green, blue, 1e-5);
  let scale = luma > 1e-5 ? curved / luma : 1;
  if (scale > 1) scale = Math.min(scale, 1 / peak);
  red *= scale;
  green *= scale;
  blue *= scale;
  const nextLuma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const highlight = smoothstep(0.82, 0.98, nextLuma);
  red += highlight * 0.012;
  green += highlight * 0.002;
  blue -= highlight * 0.008;
  return [clamp01(red), clamp01(green), clamp01(blue)];
}

export function colorSaturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max <= 1e-5 ? 0 : (max - min) / max;
}

export function rec709Luma(r: number, g: number, b: number): number {
  return r * 0.2126 + g * 0.7152 + b * 0.0722;
}
