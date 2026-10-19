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

/** Camera swoop amount for a big combo. Reduced motion keeps the camera still. */
export function swoopStrength(streak: number, comboPoints: number, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  if (comboPoints >= 5 || streak >= 25) return 1;
  if (streak >= 10) return 0.72;
  return 0;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
