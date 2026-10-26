import type { Quality } from '../game/storage';

/** Cartoon palette shared by trails, confetti and rim lights. */
export const JUICE_PALETTE = {
  gold: '#FFD93D',
  navy: '#1E2A5A',
  pink: '#FF4F9A',
  teal: '#00B8A9',
  coral: '#FF8A5B',
  violet: '#6C5CE7',
  white: '#F8F9FB',
  ink: '#222831',
} as const;

/**
 * Hard cap on live particles. High used to spawn 160; mid-range phones stay
 * smoother with a smaller instanced pool, and reduced motion cuts it again.
 */
export function particleBudget(quality: Quality, reducedMotion: boolean): number {
  const base = quality === 'high' ? 72 : quality === 'medium' ? 36 : 16;
  if (!reducedMotion) return base;
  return Math.min(12, Math.max(6, Math.floor(base / 4)));
}

export interface ComboHeat {
  /** 0 at a cold run, 1 from a 16-touch combo upward. */
  t: number;
  color: string;
  opacity: number;
}

/** Trail colour and strength. Pink, then coral, then gold as the combo climbs. */
export function comboHeat(streak: number): ComboHeat {
  const t = Math.min(1, Math.max(0, streak) / 16);
  const color = t < 0.34 ? JUICE_PALETTE.pink : t < 0.67 ? JUICE_PALETTE.coral : JUICE_PALETTE.gold;
  return { t, color, opacity: 0.16 + t * 0.62 };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface SceneLifeBudget {
  crowd: number;
  palms: number;
  flags: number;
  clouds: number;
  birds: number;
  balloons: number;
  buntingSway: boolean;
  lightSweep: boolean;
  cameraSway: boolean;
}

/**
 * Background life counts. Low and reduced-motion tiers drop birds, balloons
 * and anything that has to move every frame.
 */
export function sceneLifeBudget(quality: Quality, reducedMotion: boolean): SceneLifeBudget {
  if (reducedMotion) {
    return {
      crowd: quality === 'low' ? 6 : 10,
      palms: 2,
      flags: 2,
      clouds: 2,
      birds: 0,
      balloons: 0,
      buntingSway: false,
      lightSweep: false,
      cameraSway: false,
    };
  }
  switch (quality) {
    case 'low':
      return {
        crowd: 8,
        palms: 2,
        flags: 2,
        clouds: 2,
        birds: 0,
        balloons: 0,
        buntingSway: false,
        lightSweep: false,
        cameraSway: false,
      };
    case 'medium':
      return {
        crowd: 14,
        palms: 3,
        flags: 3,
        clouds: 3,
        birds: 2,
        balloons: 3,
        buntingSway: true,
        lightSweep: false,
        cameraSway: true,
      };
    case 'high':
      return {
        crowd: 28,
        palms: 4,
        flags: 4,
        clouds: 5,
        birds: 4,
        balloons: 5,
        buntingSway: true,
        lightSweep: true,
        cameraSway: true,
      };
    default: {
      const unexpected: never = quality;
      return unexpected;
    }
  }
}

/** How far the crowd bobs. A long combo lifts the wave; reduced motion holds still. */
export function crowdBob(streak: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  const heat = Math.min(1, Math.max(0, streak) / 16);
  return 0.035 + heat * 0.09;
}

/** Slow gameplay sway. Zero when the tier or reduced motion asks for a still camera. */
export function cameraSway(time: number, quality: Quality, reducedMotion: boolean): { x: number; y: number } {
  if (!sceneLifeBudget(quality, reducedMotion).cameraSway) return { x: 0, y: 0 };
  return {
    x: Math.sin(time * 0.55) * 0.045,
    y: Math.sin(time * 0.37) * 0.02,
  };
}
