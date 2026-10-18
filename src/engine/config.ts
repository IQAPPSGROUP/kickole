export type Side = 'left' | 'right';
export type Grade = 'perfect' | 'good' | 'poor' | 'miss';

export interface TimingConfig {
  /** Max distance (ms) from the ideal contact moment for each grade. */
  perfectMs: number;
  goodMs: number;
  poorMs: number;
}

export interface ScoringConfig {
  kickUp: number;
  perfectBonus: number;
  alternateBonus: number;
  footStall: number;
}

export interface GameConfig {
  timing: TimingConfig;
  scoring: ScoringConfig;
  /** Fixed physics step in seconds. */
  fixedStep: number;
  gravity: number;
  ballRadius: number;
  /** Height of the ball centre at which the foot makes contact. */
  contactHeight: number;
  /** Ball distance in front of the player (z). */
  ballZ: number;
  /** Horizontal foot offset from centre. */
  footX: number;
  /** Upward velocity given by a perfect kick. */
  kickSpeed: number;
  /** Upward velocity of the first launch from the ground. */
  launchSpeed: number;
  /** Gravity grows by this fraction per kick-up, up to maxGravityScale. */
  gravityRamp: number;
  maxGravityScale: number;
  /** Cooldown (s) after a mistimed tap. */
  missCooldown: number;
  /** Hold time (s) before a held control becomes a foot stall. */
  /** Seconds between the tap and the ball response, so the foot arrives before the ball leaves (animation contact). */
  contactDelay: number;
  stallHoldTime: number;
  /** Max stall duration (s) before an automatic flick. */
  stallMaxTime: number;
  /** Time (s) the dropped ball keeps bouncing before the run is over. */
  dropTime: number;
  /** Max horizontal distance of the ball from the centre. */
  courtHalfWidth: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  timing: { perfectMs: 45, goodMs: 100, poorMs: 160 },
  scoring: { kickUp: 1, perfectBonus: 2, alternateBonus: 3, footStall: 10 },
  fixedStep: 1 / 120,
  gravity: 11,
  ballRadius: 0.14,
  contactHeight: 0.72,
  ballZ: 0.62,
  footX: 0.17,
  kickSpeed: 5.6,
  launchSpeed: 6.4,
  gravityRamp: 0.012,
  maxGravityScale: 1.45,
  missCooldown: 0.22,
  contactDelay: 0.04,
  stallHoldTime: 0.14,
  stallMaxTime: 1.0,
  dropTime: 1.1,
  courtHalfWidth: 1.6,
};
