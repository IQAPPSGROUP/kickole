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
 * A 4 m miss at 0.0026 aperture is about a 1% blur; the player stays inside a sharp metre.
 */
export function depthOfFieldScale(phase: Phase, celebrating: boolean): { aperture: number; maxblur: number } {
  if (phase === 'menu' || celebrating) return { aperture: 0.0026, maxblur: 0.018 };
  return { aperture: 0.0014, maxblur: 0.009 };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Display-referred street grade. It runs after AgX, so it tints the picture
 * instead of crushing the face photograph in linear light.
 */
export function gradeDisplayColor(r: number, g: number, b: number): [number, number, number] {
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const shadow = 1 - smoothstep(0.12, 0.5, luma);
  const highlight = smoothstep(0.55, 0.92, luma);
  let red = r + highlight * 0.04 + shadow * 0.008;
  let green = g + highlight * 0.01 + shadow * 0.006;
  let blue = b - highlight * 0.028 + shadow * 0.02;
  const sat = 1.05;
  red = luma + (red - luma) * sat;
  green = luma + (green - luma) * sat;
  blue = luma + (blue - luma) * sat;
  return [clamp01(red * 0.98 + 0.016), clamp01(green * 0.98 + 0.014), clamp01(blue * 0.98 + 0.014)];
}
