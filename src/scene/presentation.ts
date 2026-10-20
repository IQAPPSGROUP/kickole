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

/**
 * Display grade after AgX. Midtones lift, highlights stay near white,
 * and a small warm tint keeps carnival colour without painting the face orange.
 */
export function gradeDisplayColor(r: number, g: number, b: number): [number, number, number] {
  const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const mid = luma * (1 - luma);
  const lifted = luma + mid * 0.18;
  const scale = luma > 1e-5 ? lifted / luma : 1;
  let red = r * scale;
  let green = g * scale;
  let blue = b * scale;
  const highlight = smoothstep(0.62, 0.92, lifted);
  red += highlight * 0.03;
  green += highlight * 0.01;
  blue -= highlight * 0.018;
  const sat = 1.08;
  const nextLuma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
  red = nextLuma + (red - nextLuma) * sat;
  green = nextLuma + (green - nextLuma) * sat;
  blue = nextLuma + (blue - nextLuma) * sat;
  const toe = 0.018;
  return [clamp01(red * (1 - toe) + toe), clamp01(green * (1 - toe) + toe * 0.96), clamp01(blue * (1 - toe) + toe * 0.9)];
}
