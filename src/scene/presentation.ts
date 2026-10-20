import type { Phase } from '../engine/engine';

/** Title and celebration hold the player sharp and let the street fall soft. Replay keeps a lighter blur. */
export function depthOfFieldActive(phase: Phase, celebrating: boolean): boolean {
  switch (phase) {
    case 'menu':
    case 'over':
      return true;
    case 'ready':
    case 'playing':
    case 'dropped':
      return celebrating;
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
 * The back wall sits about 3 m behind the chest, so 0.0072 aperture is a small soft disk
 * there while the player's feet stay inside a pixel.
 */
export function depthOfFieldScale(phase: Phase, celebrating: boolean): { aperture: number; maxblur: number } {
  if (phase === 'menu' || celebrating) return { aperture: 0.0072, maxblur: 0.024 };
  return { aperture: 0.004, maxblur: 0.014 };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Gentle contrast S-curve. Black and white stay put; the quarters pull apart. */
export function contrastCurve(value: number): number {
  const t = clamp01(value);
  const centered = t - 0.5;
  return clamp01(t + 0.46 * centered * (1 - 4 * centered * centered));
}

/**
 * Display grade after AgX. Contrast comes back through the S-curve.
 * Vibrance lifts dull carnival colours more than an already-strong hue.
 * Blacks stay deep. There is no midtone lift.
 */
export function gradeDisplayColor(r: number, g: number, b: number): [number, number, number] {
  let red = contrastCurve(r);
  let green = contrastCurve(g);
  let blue = contrastCurve(b);
  const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  const highlight = smoothstep(0.72, 0.95, luma);
  red += highlight * 0.018;
  green += highlight * 0.004;
  blue -= highlight * 0.012;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max <= 1e-5 ? 0 : (max - min) / max;
  const sat = 1.18 + 0.26 * (1 - chroma);
  const nextLuma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  red = nextLuma + (red - nextLuma) * sat;
  green = nextLuma + (green - nextLuma) * sat;
  blue = nextLuma + (blue - nextLuma) * sat;
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
