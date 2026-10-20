/** Carnival cloth stays in the gap between the back rope and the beach goal. */

export const BEACH_ROPE_Z = -4.4;
/** Goal mouth from tools/generate_beach.py, placed at z=-5.35. */
export const BEACH_GOAL_MOUTH_Z = -5.35;

export const BEACH_FESTA = ['#ff4f9a', '#ffd93d', '#2ee6d6', '#7c6bff', '#ff8a3d', '#ffffff', '#5ee08a'] as const;

export const BEACH_FLAG_X = [-4.55, -3.55, -2.45, -1.35, -0.25] as const;

export const BEACH_BUNTING_COUNT = 16;
export const BEACH_STREAMER_COUNT = 10;

const POLE_HEIGHT = 2.5;

export function beachBuntingSpot(index: number, flutter = 0): { x: number; y: number; z: number } {
  const u = index / (BEACH_BUNTING_COUNT - 1);
  return {
    x: -4.7 + u * 6.4,
    y: 2.5 - Math.sin(u * Math.PI) * 0.42 + flutter,
    z: -4.72,
  };
}

export function beachFlagSpot(index: number, flutter = 0): { x: number; y: number; z: number } {
  const x = BEACH_FLAG_X[index] ?? BEACH_FLAG_X[0];
  return { x: x + 0.16, y: 2.5 + flutter, z: -4.78 };
}

export function beachPoleSpot(index: number): { x: number; y: number; z: number } {
  const x = BEACH_FLAG_X[index] ?? BEACH_FLAG_X[0];
  return { x, y: POLE_HEIGHT / 2, z: -4.9 };
}

export function beachStreamerSpot(index: number, flutter = 0): { x: number; y: number; z: number } {
  const u = index / (BEACH_STREAMER_COUNT - 1);
  return { x: -4.4 + u * 5.2, y: 2.15 + flutter, z: -4.62 };
}

/** Every cloth and pole sits behind the rope and in front of the goal mouth. */
export function beachCarnivalClearOfPlay(): boolean {
  const spots = [
    ...Array.from({ length: BEACH_BUNTING_COUNT }, (_, i) => beachBuntingSpot(i)),
    ...BEACH_FLAG_X.map((_, i) => beachFlagSpot(i)),
    ...BEACH_FLAG_X.map((_, i) => beachPoleSpot(i)),
    ...Array.from({ length: BEACH_STREAMER_COUNT }, (_, i) => beachStreamerSpot(i)),
  ];
  return spots.every((spot) => spot.z < BEACH_ROPE_Z - 0.15 && spot.z > BEACH_GOAL_MOUTH_Z + 0.3);
}
