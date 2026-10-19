import type { ContactTarget, TrickKind } from './tricks';

export type Side = 'left' | 'right';
export type Grade = 'perfect' | 'good' | 'poor' | 'miss';
export type { TrickKind };

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
  /** Awarded once per successful header. */
  header: number;
  /** Awarded once per successful thigh touch. */
  thigh: number;
  /** Awarded once when a neck stall is successfully caught. */
  neckStall: number;
  /** Awarded once when around-the-world completes (pop + revolution + return). */
  aroundTheWorld: number;
  /** Variety bonus awarded once per completed trick combination. */
  varietyBonus: number;
}

export interface TrickTimingConfig {
  /** Horizontal/depth tolerance around a logical contact target (metres). */
  depthTol: number;
  lateralTol: number;
  /** Short window to request a neck catch once the ball enters the nape band (ms). */
  neckPrepMs: number;
  /** Max neck-stall hold before an automatic flick (s). */
  neckMaxHold: number;
  /** Duration of one ATW foot revolution (s). */
  atwRevolutionTime: number;
  /** Timing window for the ATW returning touch (ms). */
  atwReturnMs: number;
  /** Cool-down after a rejected / failed trick request (s). */
  trickCooldown: number;
  /** Seconds between successful combo steps before progress expires. */
  comboExpirySec: number;
}

export interface GameConfig {
  timing: TimingConfig;
  scoring: ScoringConfig;
  tricks: TrickTimingConfig;
  /** Logical ball-centre contact targets (radius baked into authored Y/Z). */
  contacts: {
    foot: ContactTarget;
    thigh: ContactTarget;
    forehead: ContactTarget;
    nape: ContactTarget;
  };
  /** Fixed physics step in seconds. */
  fixedStep: number;
  gravity: number;
  ballRadius: number;
  /**
   * Height of the ball centre at which the foot makes contact.
   * Mirrored by `contacts.foot.y` — kept for existing animation/tests.
   */
  contactHeight: number;
  /** Ball distance in front of the player (z). Mirrored by `contacts.foot.z`. */
  ballZ: number;
  /** Horizontal foot offset from centre. */
  footX: number;
  /** Upward velocity given by a perfect kick. */
  kickSpeed: number;
  /** Upward velocity of the first launch from the ground. */
  launchSpeed: number;
  /**
   * World-space ball-centre apex used to derive the high-flick impulse from current gravity.
   * Not applied to normal kicks.
   */
  highFlickApex: number;
  /** Modest pop used to start around-the-world (below a normal kick). */
  atwPopSpeed: number;
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

const FOOT: ContactTarget = { y: 0.72, z: 0.62 };

export const DEFAULT_CONFIG: GameConfig = {
  timing: { perfectMs: 45, goodMs: 100, poorMs: 160 },
  scoring: {
    kickUp: 1,
    perfectBonus: 2,
    alternateBonus: 3,
    footStall: 10,
    header: 3,
    thigh: 2,
    neckStall: 10,
    aroundTheWorld: 20,
    varietyBonus: 5,
  },
  tricks: {
    depthTol: 0.22,
    lateralTol: 0.35,
    neckPrepMs: 140,
    neckMaxHold: 1.15,
    atwRevolutionTime: 0.55,
    atwReturnMs: 160,
    trickCooldown: 0.2,
    comboExpirySec: 3.5,
  },
  contacts: {
    foot: FOOT,
    thigh: { y: 1.02, z: 0.56 },
    forehead: { y: 1.68, z: 0.4 },
    nape: { y: 1.5, z: 0.1 },
  },
  fixedStep: 1 / 120,
  gravity: 11,
  ballRadius: 0.14,
  contactHeight: FOOT.y,
  ballZ: FOOT.z,
  footX: 0.17,
  kickSpeed: 5.6,
  launchSpeed: 6.4,
  highFlickApex: 2.85,
  atwPopSpeed: 4.4,
  gravityRamp: 0.012,
  maxGravityScale: 1.45,
  missCooldown: 0.22,
  contactDelay: 0.04,
  stallHoldTime: 0.14,
  stallMaxTime: 1.0,
  dropTime: 1.1,
  courtHalfWidth: 1.6,
};
