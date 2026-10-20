import type { BeatGrade } from '../game/beat';
import { groovePoints } from '../game/beat';
import { DEFAULT_CONFIG, type GameConfig, type Grade, type Side } from './config';
import { streakMultiplier } from './scoring';
import { footContactAnchors } from './footContact';
import {
  createComboTracker,
  pushComboEvent,
  resetComboTracker,
  type ComboEvent,
  type ComboId,
} from './combos';
import {
  apexForKickPower,
  createTrickState,
  impulseForApex,
  nearDepth,
  normalKickApex,
  timeToHeight,
  type TrickKind,
  type TrickPhase,
  type TrickState,
} from './tricks';

export type Phase = 'menu' | 'ready' | 'playing' | 'dropped' | 'over';
export type { TrickKind, TrickPhase, TrickState };
export type { ComboEvent, ComboId };

export interface BallState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Euler rotation (radians) and angular velocity (rad/s). */
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
}

export type EngineEvent =
  | { type: 'launch'; side: Side }
  | { type: 'kick'; side: Side; grade: Exclude<Grade, 'miss'>; points: number; alternate: boolean; stall: boolean; streak: number; deltaMs: number }
  | { type: 'miss'; side: Side; deltaMs: number }
  | { type: 'stallStart'; side: Side }
  | { type: 'trick'; kind: TrickKind; phase: TrickPhase; points: number; side: Side | null }
  | { type: 'trickFail'; kind: TrickKind; reason: string }
  | { type: 'combo'; id: ComboId; label: string; points: number }
  | { type: 'drop' }
  | { type: 'over' };

export interface RunStats {
  score: number;
  kickUps: number;
  bestStreak: number;
  stalls: number;
  headers: number;
  thighs: number;
  neckStalls: number;
  aroundTheWorlds: number;
  highFlicks: number;
  grooves: number;
  combos: number;
}

export interface CelebrationState {
  danceId: string;
  reason: string;
  startedAt: number;
  until: number;
}

export type GroovePart = 'knee' | 'chest';

export interface Contact {
  kind: 'pending' | 'stall';
  side: Side;
  grade: Exclude<Grade, 'miss'>;
  deltaMs: number;
  held: number;
  /** When true, release uses the high-flick apex impulse instead of kickSpeed. */
  highFlick: boolean;
  /** 0 for a tap. A held charge eases the apex toward highFlickApex. */
  kickPower: number;
  /** When true, release is a thigh return (trick bonus already handled on trap). */
  thigh: boolean;
  /** High kick that starts the equipped dance, then leaves a normal catch. */
  groove?: boolean;
}

export type FootTrick = Extract<TrickKind, 'aroundTheWorld' | 'thigh' | 'highFlick' | 'groove'>;

export interface KickCharge {
  side: Side;
  held: number;
  /** 0–1 loft, filled over kickChargeTime. */
  power: number;
}

/**
 * Deterministic football juggling simulation. Knows nothing about React or three.js.
 * Advance with update(frameSeconds); feed input with press()/release().
 * Tricks are selected via setTrick(); with no selection, foot juggling matches the classic rules.
 */
export class GameEngine {
  readonly config: GameConfig;
  phase: Phase = 'menu';
  ball: BallState;
  stats: RunStats = emptyStats();
  streak = 0;
  lastSide: Side | null = null;
  /** Simulated time in seconds. */
  time = 0;
  /** Time of the tap that started a foot action (the foot starts moving). */
  lastKick: Record<Side, number> = { left: -10, right: -10 };
  /** Time the ball actually responded to a kick (tap + contactDelay at the earliest). */
  lastContact: Record<Side, number> = { left: -10, right: -10 };
  lastKickGrade: Grade = 'good';
  lastDropTime = -10;
  lastPerfectTime = -10;
  /** Last non-foot trick for animation (not a fake left/right kick). */
  lastTrick: { kind: TrickKind; time: number } | null = null;
  contact: Contact | null = null;
  /**
   * Seconds left to hold a foot strike on the boot. Simulation time does not advance,
   * so the kick clip stays on its contact frame while the ball keeps spinning.
   */
  hitPause = 0;
  /** Active trick state machine, if any. */
  trick: TrickState | null = null;
  /** Next trick intent. `null` keeps classic foot-only controls. */
  selectedTrick: TrickKind | null = null;
  /** Short milestone dance. Physics holds the ball while this is set during play. */
  celebration: CelebrationState | null = null;
  /** Equipped cosmetic dance. Scoring never reads it. */
  equippedDance = 'sway';
  /** 0 on the music beat. Null until the audio clock is known. */
  beatPhase: number | null = null;
  /** Last groove tap versus the heard beat. */
  lastBeatGrade: BeatGrade = 'off';
  groovePart: GroovePart = 'knee';
  /** Shrinks dance amplitude when the player prefers reduced motion. */
  reducedMotion = false;
  /** Hold-to-kick-higher. Null unless a classic foot press started early. */
  kickCharge: KickCharge | null = null;
  /** Foot trick waiting for its timing window after a single tap. */
  queuedFoot: { kind: FootTrick; side: Side } | null = null;
  /** Header tap waiting out cooldown or for the ball to arrive. */
  queuedHeader = false;
  /** Neck tap waiting out cooldown. `tap` releases as soon as the catch lands. */
  queuedNeck: 'hold' | 'tap' | null = null;
  private acc = 0;
  private cooldown = 0;
  private trickCooldown = 0;
  private dropClock = 0;
  private gravityScale = 1;
  private listeners = new Set<(e: EngineEvent) => void>();
  private held: Record<Side, boolean> = { left: false, right: false };
  private heldNeck = false;
  /** Blocks a second header award until the ball has risen clear of the forehead. */
  private headerGuard = false;
  /** Pointer that is holding each foot, so a new finger can replace a lost release. */
  private heldPointer: Record<Side, number | null> = { left: null, right: null };
  /** Blocks a second neck award until the ball has risen clear of the nape. */
  private neckGuard = false;
  private combos = createComboTracker();
  private comboSeq = 0;

  constructor(config: Partial<GameConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      timing: { ...DEFAULT_CONFIG.timing, ...config.timing },
      scoring: { ...DEFAULT_CONFIG.scoring, ...config.scoring },
      tricks: { ...DEFAULT_CONFIG.tricks, ...config.tricks },
      contacts: {
        foot: { ...DEFAULT_CONFIG.contacts.foot, ...config.contacts?.foot },
        thigh: { ...DEFAULT_CONFIG.contacts.thigh, ...config.contacts?.thigh },
        forehead: { ...DEFAULT_CONFIG.contacts.forehead, ...config.contacts?.forehead },
        nape: { ...DEFAULT_CONFIG.contacts.nape, ...config.contacts?.nape },
        chest: { ...DEFAULT_CONFIG.contacts.chest, ...config.contacts?.chest },
      },
    };
    // Keep legacy foot fields aligned with the contact table.
    this.config.contactHeight = this.config.contacts.foot.y;
    this.config.ballZ = this.config.contacts.foot.z;
    this.ball = GameEngine.restingBall(this.config);
  }

  static restingBall(c: GameConfig): BallState {
    return { x: 0, y: c.ballRadius, z: c.ballZ, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, wx: 0, wy: 0, wz: 0 };
  }

  on(fn: (e: EngineEvent) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private emit(e: EngineEvent) {
    this.listeners.forEach((l) => l(e));
  }

  get gravity(): number {
    return this.config.gravity * this.gravityScale;
  }

  /** Put the ball at the player's feet, waiting for the first tap. */
  prepare(phase: 'menu' | 'ready' = 'ready') {
    this.phase = phase;
    this.ball = GameEngine.restingBall(this.config);
    this.stats = emptyStats();
    this.streak = 0;
    this.lastSide = null;
    this.contact = null;
    this.hitPause = 0;
    this.trick = null;
    this.selectedTrick = null;
    this.celebration = null;
    this.lastBeatGrade = 'off';
    this.kickCharge = null;
    this.queuedFoot = null;
    this.queuedHeader = false;
    this.queuedNeck = null;
    this.headerGuard = false;
    this.neckGuard = false;
    this.cooldown = 0;
    this.trickCooldown = 0;
    this.lastKick = { left: -10, right: -10 };
    this.lastContact = { left: -10, right: -10 };
    this.lastTrick = null;
    this.gravityScale = 1;
    this.acc = 0;
    this.held = { left: false, right: false };
    this.heldPointer = { left: null, right: null };
    this.heldNeck = false;
    resetComboTracker(this.combos);
    this.comboSeq = 0;
  }

  /** Count a clean touch and return its points after the streak multiplier. */
  private touchPoints(base: number): number {
    this.streak += 1;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
    return base * streakMultiplier(this.streak);
  }

  /** Record a successful scored event for variety combinations. */
  private noteCombo(event: ComboEvent) {
    this.comboSeq += 1;
    const token = `${event}:${this.time.toFixed(4)}:${this.comboSeq}`;
    const awards = pushComboEvent(this.combos, event, this.time, token, {
      varietyBonus: this.config.scoring.varietyBonus,
      expirySec: this.config.tricks.comboExpirySec,
    });
    for (const award of awards) {
      this.stats.combos++;
      this.stats.score += award.points;
      this.emit({ type: 'combo', id: award.id, label: award.label, points: award.points });
    }
  }

  /**
   * Select the next freestyle trick. Pass `null` to return to classic foot juggling.
   * Rejects while a foot trap or non-idle trick is already in progress.
   */
  setTrick(kind: TrickKind | null): boolean {
    if (kind === this.selectedTrick) return true;
    if (this.contact || (this.trick && this.trick.phase !== 'fail' && this.trick.phase !== 'recover')) {
      return false;
    }
    // Recovering ATW keeps its own state; changing selection cancels it safely.
    if (this.trick?.kind === 'aroundTheWorld' && kind !== 'aroundTheWorld') {
      this.failTrick('cancelled');
    }
    this.selectedTrick = kind;
    return true;
  }

  /**
   * Seconds until the ball (descending) passes `height`, from the given state.
   * Negative when it has already passed. Infinity if it never reaches it.
   */
  timeToContact(y = this.ball.y, vy = this.ball.vy, height = this.config.contactHeight): number {
    return timeToHeight(y, vy, height, this.gravity);
  }

  /**
   * Signed ms error versus ideal contact at `height` (positive = early, negative = late).
   * Accounts for the part of the frame not yet simulated.
   */
  timingDeltaMs(height = this.config.contactHeight): number {
    return (this.timeToContact(this.ball.y, this.ball.vy, height) - this.acc) * 1000;
  }

  gradeFor(deltaMs: number, windowMs = this.config.timing.poorMs): Grade {
    const a = Math.abs(deltaMs);
    const t = this.config.timing;
    const poor = windowMs;
    if (a <= t.perfectMs) return 'perfect';
    if (a <= t.goodMs) return 'good';
    if (a <= poor) return 'poor';
    return 'miss';
  }

  press(side: Side, pointerId: number | null = null) {
    if (this.held[side]) {
      // Same finger repeating a down is a no-op. A new finger means the last release was lost.
      if (pointerId === null || pointerId === this.heldPointer[side]) return;
      this.release(side);
    }
    this.held[side] = true;
    this.heldPointer[side] = pointerId;
    if (this.phase === 'ready') this.launch(side);
    else if (this.phase === 'playing') this.tryAction(side);
  }

  release(side: Side) {
    this.held[side] = false;
    this.heldPointer[side] = null;
    const charge = this.kickCharge;
    if (charge && charge.side === side) {
      this.kickCharge = null;
      this.releaseCharge(side, charge.power);
    }
    const c = this.contact;
    if (c && c.side === side && this.phase === 'playing' && c.held >= this.config.contactDelay) {
      this.completeContact(c.kind === 'stall');
    }
  }

  /** Lift that ended away from the button still lets the foot go. */
  releaseMatching(pointerId: number) {
    if (this.heldPointer.left === pointerId) this.release('left');
    if (this.heldPointer.right === pointerId) this.release('right');
  }

  /** Direct header attempt from the HEAD control (not a foot tap). */
  attemptHeader() {
    if (this.phase !== 'playing') return;
    if (this.headerGuard) return;
    if (this.inputBlocked() || this.trickBusy() || !this.headerWindowOpen()) {
      if (!this.headerWindowPassed()) this.queuedHeader = true;
      return;
    }
    this.selectedTrick = 'header';
    this.tryHeader();
  }

  /** NECK control. A tap catches and flicks; a hold stalls until release. */
  pressNeck() {
    if (this.phase !== 'playing') return;
    if (this.heldNeck) return;
    this.heldNeck = true;
    if (this.neckGuard) return;
    if (this.inputBlocked() || this.trickBusy() || !this.neckWindowOpen()) {
      if (!this.neckWindowPassed()) this.queuedNeck = 'hold';
      return;
    }
    this.selectedTrick = 'neckStall';
    this.tryNeckCatch();
  }

  releaseNeck() {
    if (this.queuedNeck) {
      this.heldNeck = false;
      this.queuedNeck = 'tap';
      return;
    }
    if (!this.heldNeck) return;
    this.heldNeck = false;
    this.finishNeckHold();
  }

  /**
   * One tap plays a foot trick on the other foot as soon as the window is open.
   * Returns `queued` when the ball has not arrived yet.
   */
  requestFootTrick(kind: FootTrick): 'fired' | 'queued' | 'locked' {
    if (this.phase !== 'playing') return 'locked';
    if (this.trick?.kind === 'aroundTheWorld' && this.trick.phase !== 'fail') return 'fired';
    const side: Side = this.lastSide === 'left' ? 'right' : this.lastSide === 'right' ? 'left' : 'right';
    this.selectedTrick = kind;
    this.queuedFoot = { kind, side };
    this.flushQueues();
    return this.queuedFoot ? 'queued' : 'fired';
  }

  /** Grade of the latest tap against the heard beat. Groove scoring reads this. */
  setBeatGrade(grade: BeatGrade) {
    this.lastBeatGrade = grade;
  }

  /**
   * Hold the ball and play a short dance. A second call while one is running is ignored.
   * Passing a non-positive duration does nothing.
   */
  startCelebration(danceId: string, reason: string, duration: number) {
    if (this.celebration || duration <= 0) return;
    this.celebration = {
      danceId,
      reason,
      startedAt: this.time,
      until: this.time + duration,
    };
    if (this.phase === 'playing') {
      this.ball.vx = 0;
      this.ball.vy = 0;
      this.ball.vz = 0;
    }
  }

  /** End the dance early and leave a descending ball when the run is still live. */
  skipCelebration(): boolean {
    if (!this.celebration) return false;
    this.finishCelebration(this.phase === 'playing');
    return true;
  }

  private finishCelebration(resumeBall: boolean) {
    this.celebration = null;
    if (!resumeBall || this.phase !== 'playing') return;
    const c = this.config;
    this.ball.x *= 0.25;
    this.ball.y = Math.max(this.ball.y, c.contactHeight + 0.48);
    this.ball.z = c.ballZ;
    this.ball.vx = 0;
    this.ball.vy = -1.35;
    this.ball.vz = 0;
  }

  /** Arm or cancel a foot-armed trick (ATW / thigh / high flick / groove). */
  armTrick(kind: Extract<TrickKind, 'aroundTheWorld' | 'thigh' | 'highFlick' | 'groove'> | null) {
    if (kind === null) {
      this.queuedFoot = null;
      this.setTrick(null);
      return true;
    }
    if (this.selectedTrick === kind) return this.setTrick(null);
    return this.setTrick(kind);
  }

  private launch(side: Side) {
    const b = this.ball;
    b.vy = this.config.launchSpeed;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.5;
    this.applySpin(side, 1);
    this.phase = 'playing';
    this.lastKick[side] = this.time;
    this.emit({ type: 'launch', side });
  }

  private tryAction(side: Side) {
    if (this.cooldown > 0 || this.contact) return;
    if (this.trickCooldown > 0) return;

    const intent = this.selectedTrick;
    if (intent === 'header') {
      this.tryHeader();
      return;
    }
    if (intent === 'neckStall') {
      this.tryNeckCatch();
      return;
    }
    if (intent === 'aroundTheWorld') {
      this.tryAroundTheWorld(side);
      return;
    }
    if (intent === 'thigh') {
      this.tryThigh(side);
      return;
    }
    if (intent === 'groove') {
      this.tryGroove(side);
      return;
    }
    // Outside the window, an early tap waits and a late tap is just as free.
    if (intent == null && this.footTiming() !== 'open') {
      this.kickCharge = { side, held: 0, power: 0 };
      return;
    }
    // highFlick or null → classic foot trap; highFlick flags the pending contact.
    this.tryKick(side, intent === 'highFlick');
  }

  private tryKick(side: Side, highFlick = false, kickPower = 0) {
    if (this.trick && this.trick.kind === 'aroundTheWorld' && this.trick.phase !== 'fail') return;
    const deltaMs = this.timingDeltaMs();
    const grade = this.gradeFor(deltaMs);
    this.lastKick[side] = this.time;
    if (grade === 'miss') {
      this.emitMiss(side, deltaMs);
      return;
    }
    this.contact = { kind: 'pending', side, grade, deltaMs, held: 0, highFlick, kickPower: highFlick ? 0 : kickPower, thigh: false };
    const b = this.ball;
    b.vx = b.vy = b.vz = 0;
    const anchor = footContactAnchors[side];
    if (anchor) {
      b.x = anchor.x;
      b.y = anchor.y;
      b.z = anchor.z;
    } else {
      b.y = this.config.contactHeight;
      b.z = this.config.ballZ;
      b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.6;
    }
    if (highFlick) this.selectedTrick = null;
  }

  private tryThigh(side: Side) {
    if (this.trick) {
      this.rejectTrick('thigh', 'busy');
      return;
    }
    const target = this.config.contacts.thigh;
    if (!this.inContactBand(target) || this.ball.vy >= 0) {
      this.rejectTrick('thigh', 'window');
      return;
    }
    const deltaMs = this.timingDeltaMs(target.y);
    const grade = this.gradeFor(deltaMs);
    if (grade === 'miss') {
      this.rejectTrick('thigh', 'timing');
      this.streak = 0;
      this.cooldown = this.config.missCooldown;
      return;
    }
    // Foot statistic: thigh is a lower-limb touch, recorded on the used side.
    this.lastKick[side] = this.time;
    this.contact = { kind: 'pending', side, grade, deltaMs, held: 0, highFlick: false, kickPower: 0, thigh: true };
    const b = this.ball;
    b.y = target.y;
    b.z = target.z;
    b.vx = b.vy = b.vz = 0;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.45;
    this.trick = createTrickState('thigh', side, this.time, 'contact');
    this.emit({ type: 'trick', kind: 'thigh', phase: 'contact', points: 0, side });
  }

  private tryGroove(side: Side) {
    if (this.trick && this.trick.phase !== 'recover' && this.trick.phase !== 'fail') {
      this.rejectTrick('groove', 'busy');
      return;
    }
    // Same foot window as a flick. A tap sends the ball high; the dance plays in the air.
    const deltaMs = this.timingDeltaMs();
    const grade = this.gradeFor(deltaMs);
    this.lastKick[side] = this.time;
    this.selectedTrick = null;
    if (grade === 'miss') {
      this.emitMiss(side, deltaMs);
      return;
    }
    this.contact = {
      kind: 'pending', side, grade, deltaMs, held: 0,
      highFlick: false, kickPower: 0, thigh: false, groove: true,
    };
    const b = this.ball;
    b.y = this.config.contactHeight;
    b.z = this.config.ballZ;
    b.vx = b.vy = b.vz = 0;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.6;
  }

  private tryHeader() {
    if (this.trick) {
      this.rejectTrick('header', 'busy');
      return;
    }
    if (this.ball.vy >= 0 || !this.headerLane()) {
      this.rejectTrick('header', 'window');
      return;
    }
    const deltaMs = this.timingDeltaMs(this.config.contacts.forehead.y);
    const grade = this.gradeFor(deltaMs);
    if (grade === 'miss') {
      this.rejectTrick('header', 'timing');
      this.streak = 0;
      this.cooldown = this.config.missCooldown;
      return;
    }
    this.trick = createTrickState('header', null, this.time, 'execute');
    this.lastTrick = { kind: 'header', time: this.time };
    this.completeHeader(grade, deltaMs);
  }

  private completeHeader(grade: Exclude<Grade, 'miss'>, _deltaMs: number) {
    const t = this.trick;
    if (!t || t.kind !== 'header') return;
    const { scoring } = this.config;
    let points = scoring.header;
    if (grade === 'perfect') points += scoring.perfectBonus;
    points = this.touchPoints(points);
    if (!t.awarded) {
      t.awarded = true;
      this.stats.headers++;
      this.stats.score += points;
    }
    this.lastKickGrade = grade;
    if (grade === 'perfect') this.lastPerfectTime = this.time;
    this.gravityScale = Math.min(this.config.maxGravityScale, this.gravityScale + this.config.gravityRamp);

    const b = this.ball;
    const quality = grade === 'perfect' ? 1 : grade === 'good' ? 0.94 : 0.86;
    // Pop 0.3–0.6 m above the forehead. The head meets the ball; the ball is not pulled onto the face.
    const rise = 0.45 * quality;
    b.vy = impulseForApex(this.config.contacts.forehead.y + rise, b.y, this.gravity);
    b.vx = 0;
    b.vz = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
    this.emit({ type: 'trick', kind: 'header', phase: 'execute', points, side: null });
    this.noteCombo('header');
    this.selectedTrick = null;
    this.headerGuard = true;
    this.queuedHeader = false;
    this.trick = { ...t, phase: 'recover' };
  }

  private tryNeckCatch() {
    // Allow a catch once a prior short recover (e.g. header) has finished posing.
    if (this.trick && this.trick.phase !== 'recover' && this.trick.phase !== 'fail') {
      this.rejectTrick('neckStall', 'busy');
      return;
    }
    if (this.trick) this.trick = null;
    const target = this.config.contacts.nape;
    if (this.ball.vy >= 0 || !this.neckApproach()) {
      this.rejectTrick('neckStall', 'window');
      return;
    }
    const deltaMs = this.timingDeltaMs(target.y);
    // Narrower preparation window than a normal kick.
    if (this.gradeFor(deltaMs, this.config.tricks.neckPrepMs) === 'miss') {
      this.rejectTrick('neckStall', 'timing');
      this.streak = 0;
      this.cooldown = this.config.missCooldown;
      return;
    }
    const b = this.ball;
    b.x = target.x ?? 0;
    b.y = target.y;
    b.z = target.z;
    b.vx = b.vy = b.vz = 0;
    const trick = createTrickState('neckStall', null, this.time, 'contact');
    const points = this.touchPoints(this.config.scoring.neckStall);
    trick.awarded = true;
    this.stats.neckStalls++;
    this.stats.score += points;
    this.lastTrick = { kind: 'neckStall', time: this.time };
    this.trick = trick;
    this.selectedTrick = null;
    this.neckGuard = true;
    this.queuedNeck = null;
    this.emit({ type: 'trick', kind: 'neckStall', phase: 'contact', points, side: null });
    this.noteCombo('neckCatch');
  }

  private finishNeckHold() {
    const neck = this.trick;
    if (neck && neck.kind === 'neckStall' && (neck.phase === 'contact' || neck.phase === 'execute')) {
      this.releaseNeckStall();
    }
  }

  private releaseNeckStall() {
    const t = this.trick;
    if (!t || t.kind !== 'neckStall') return;
    if (t.phase !== 'contact' && t.phase !== 'execute') return;
    const hadCatch = t.awarded;
    t.phase = 'execute';
    const b = this.ball;
    const g = this.gravity;
    // Believable flick off the nape toward freestyle height.
    b.vy = impulseForApex(2.35, b.y, g);
    // Leave backward off the upper back, then the recover step carries it forward once it is above the head.
    b.vz = -0.7;
    b.vx = 0;
    b.wx = -5; b.wy = 1; b.wz = 3;
    this.emit({ type: 'trick', kind: 'neckStall', phase: 'execute', points: 0, side: null });
    t.phase = 'recover';
    if (hadCatch) this.noteCombo('neckRelease');
  }

  private tryAroundTheWorld(side: Side) {
    const existing = this.trick;
    if (existing && existing.kind === 'aroundTheWorld') return;
    if (existing) {
      this.rejectTrick('aroundTheWorld', 'busy');
      return;
    }
    const deltaMs = this.timingDeltaMs();
    const grade = this.gradeFor(deltaMs);
    this.lastKick[side] = this.time;
    if (grade === 'miss') {
      this.emitMiss(side, deltaMs);
      return;
    }
    // Soft laces pop, straight up, no spin. Air time matches the orbit.
    const b = this.ball;
    const anchor = footContactAnchors[side];
    if (anchor) {
      b.x = anchor.x;
      b.y = anchor.y;
      b.z = anchor.z;
    } else {
      b.y = this.config.contactHeight;
      b.z = this.config.ballZ;
      b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.55;
    }
    const flight = this.config.tricks.atwRevolutionTime;
    b.vy = (flight * this.gravity) / 2;
    b.vx = 0;
    b.vz = 0;
    b.wx = 0;
    b.wy = 0;
    b.wz = 0;
    this.lastContact[side] = this.time;
    this.lastKickGrade = grade;
    this.trick = createTrickState('aroundTheWorld', side, this.time, 'execute');
    this.emit({ type: 'trick', kind: 'aroundTheWorld', phase: 'execute', points: 0, side });
  }

  /** The orbit ends as the ball returns. The foot is already back underneath it. */
  private completeAtwCatch(existing: TrickState) {
    if (existing.awarded) return;
    const side = existing.side ?? 'right';
    const { scoring } = this.config;
    const grade: Exclude<Grade, 'miss'> = this.lastKickGrade === 'perfect'
      || this.lastKickGrade === 'good'
      || this.lastKickGrade === 'poor'
      ? this.lastKickGrade
      : 'good';
    let points = scoring.kickUp + scoring.aroundTheWorld;
    if (grade === 'perfect') points += scoring.perfectBonus;
    const alternate = this.lastSide !== null && this.lastSide !== side;
    if (alternate) points += scoring.alternateBonus;
    points = this.touchPoints(points);
    existing.awarded = true;
    existing.revolution = 1;
    existing.phase = 'recover';
    existing.held = this.time;
    this.stats.aroundTheWorlds++;
    this.stats.kickUps++;
    this.stats.score += points;
    this.lastSide = side;
    this.lastContact[side] = this.time;
    this.lastTrick = { kind: 'aroundTheWorld', time: this.time };
    if (grade === 'perfect') this.lastPerfectTime = this.time;
    this.gravityScale = Math.min(this.config.maxGravityScale, this.gravityScale + this.config.gravityRamp);

    const b = this.ball;
    b.y = this.config.contactHeight;
    b.z = this.config.ballZ;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.55;
    b.vy = this.config.kickSpeed * 0.92;
    b.vx = 0;
    b.vz = 0;
    this.applySpin(side, 0.65);
    this.emit({ type: 'trick', kind: 'aroundTheWorld', phase: 'recover', points, side });
    this.emit({
      type: 'kick', side, grade, points, alternate, stall: false, streak: this.streak, deltaMs: 0,
    });
    this.noteCombo('atwComplete');
    this.queuedFoot = null;
  }

  private inContactBand(
    target: { y: number; z: number; x?: number },
    depthTol = this.config.tricks.depthTol,
  ): boolean {
    const b = this.ball;
    if (!nearDepth(b.z, target.z, depthTol)) return false;
    if (target.x !== undefined && Math.abs(b.x - target.x) > this.config.tricks.lateralTol) return false;
    if (Math.abs(b.x) > this.config.courtHalfWidth) return false;
    return true;
  }

  private rejectTrick(kind: TrickKind, reason: string) {
    this.trickCooldown = this.config.tricks.trickCooldown;
    this.emit({ type: 'trickFail', kind, reason });
  }

  private failTrick(reason: string) {
    const t = this.trick;
    if (!t) return;
    t.phase = 'fail';
    this.emit({ type: 'trickFail', kind: t.kind, reason });
    this.trick = null;
    this.trickCooldown = this.config.tricks.trickCooldown;
    resetComboTracker(this.combos);
  }

  private completeContact(stall: boolean) {
    const c = this.contact;
    if (!c) return;
    this.contact = null;
    if (c.groove) {
      this.finishGrooveKick(c);
      return;
    }
    const { scoring } = this.config;
    const alternate = this.lastSide !== null && this.lastSide !== c.side;
    let points = scoring.kickUp;
    if (c.grade === 'perfect') points += scoring.perfectBonus;
    if (alternate) points += scoring.alternateBonus;
    if (stall) { points += scoring.footStall; this.stats.stalls++; }
    if (c.thigh) {
      const tr = this.trick;
      if (tr && tr.kind === 'thigh' && !tr.awarded) {
        points += scoring.thigh;
        tr.awarded = true;
        this.stats.thighs++;
        this.emit({ type: 'trick', kind: 'thigh', phase: 'execute', points: scoring.thigh, side: c.side });
      }
      this.trick = null;
      this.selectedTrick = null;
    }
    const lofty = !stall && !c.thigh && (c.highFlick || c.kickPower >= this.config.highKickComboPower);
    if (lofty) {
      this.stats.highFlicks++;
      this.lastTrick = { kind: 'highFlick', time: this.time };
    }

    points = this.touchPoints(points);
    this.stats.kickUps++;
    this.stats.score += points;
    this.lastSide = c.side;
    this.lastContact[c.side] = this.time;
    this.lastKickGrade = c.grade;
    if (c.grade === 'perfect') this.lastPerfectTime = this.time;

    const quality = c.grade === 'perfect' || stall ? 1 : c.grade === 'good' ? 0.95 : 0.86;
    const b = this.ball;
    if (c.highFlick) {
      // Armed flick keeps the exact authored apex. A charge eases toward it instead.
      b.vy = impulseForApex(this.config.highFlickApex, b.y, this.gravity);
    } else if (c.kickPower > 0 && !c.thigh) {
      const normal = normalKickApex(b.y, this.config.kickSpeed * quality, this.gravity);
      const apex = apexForKickPower(c.kickPower, normal, this.config.highFlickApex);
      b.vy = impulseForApex(apex, b.y, this.gravity);
    } else if (c.thigh) {
      b.vy = this.config.kickSpeed * 0.92 * quality;
      b.z = this.config.contacts.foot.z;
    } else {
      b.vy = this.config.kickSpeed * quality;
    }
    this.gravityScale = Math.min(this.config.maxGravityScale, this.gravityScale + this.config.gravityRamp);
    const dir = c.side === 'left' ? -1 : 1;
    const wide = c.grade === 'poor' ? dir * 0.28 : 0;
    const flight = (2 * b.vy) / this.gravity;
    const lim = this.config.courtHalfWidth;
    const targetX = Math.max(-lim, Math.min(lim, -dir * this.config.footX * 0.5 + wide));
    b.vx = (targetX - b.x) / flight;
    b.vz = c.thigh ? (this.config.ballZ - b.z) / Math.max(flight, 1e-3) : 0;
    this.applySpin(c.side, quality);
    if (!c.thigh) this.hitPause = this.config.hitPause;
    this.emit({ type: 'kick', side: c.side, grade: c.grade, points, alternate, stall, streak: this.streak, deltaMs: c.deltaMs });
    if (lofty) this.noteCombo('highFlick');
    else if (c.thigh) this.noteCombo('thighTouch');
    else if (stall) this.noteCombo('footStall');
    else this.noteCombo('footTouch');
  }

  private spinHeld(dt: number) {
    const b = this.ball;
    b.rx += b.wx * dt;
    b.ry += b.wy * dt;
    b.rz += b.wz * dt;
  }

  /** High kick, on-beat score, and a dance that ends while the ball is still above the player. */
  private finishGrooveKick(c: Contact) {
    const { scoring } = this.config;
    const points = this.touchPoints(groovePoints(scoring.groove, this.lastBeatGrade, scoring.grooveBeatPerfect, scoring.grooveBeatGood));
    this.stats.grooves++;
    this.stats.score += points;
    this.lastSide = c.side;
    this.lastContact[c.side] = this.time;
    this.lastKickGrade = c.grade;
    if (c.grade === 'perfect') this.lastPerfectTime = this.time;
    this.selectedTrick = null;
    const nextScale = Math.min(this.config.maxGravityScale, this.gravityScale + this.config.gravityRamp);
    this.gravityScale = nextScale;
    const g = this.config.gravity * nextScale;
    const flight = this.config.tricks.grooveFlightSec;
    const b = this.ball;
    b.x = 0;
    b.y = this.config.contactHeight;
    b.z = this.config.ballZ;
    b.vx = 0;
    b.vz = 0;
    b.vy = (flight * g) / 2;
    this.applySpin(c.side, c.grade === 'poor' ? 0.86 : 1);
    const trick = createTrickState('groove', c.side, this.time, 'execute');
    trick.awarded = true;
    this.trick = trick;
    this.lastTrick = { kind: 'groove', time: this.time };
    this.emit({ type: 'trick', kind: 'groove', phase: 'execute', points, side: c.side });
  }

  /** Cushion the fast drop: the foot gives, then a low ball is back under control. */
  private finishGrooveCatch(trick: TrickState) {
    const side = trick.side ?? this.lastSide ?? 'right';
    const b = this.ball;
    const drop = 0.25;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.55;
    b.z = this.config.ballZ;
    b.y = Math.max(this.config.ballRadius + 0.04, this.config.contactHeight - drop);
    b.vx = 0;
    b.vz = 0;
    b.wx *= 0.15;
    b.wy *= 0.15;
    b.wz *= 0.15;
    b.vy = impulseForApex(b.y + 0.35, b.y, this.gravity);
    trick.phase = 'recover';
    trick.held = this.time;
    trick.side = side;
    this.queuedFoot = null;
    this.emit({ type: 'trick', kind: 'groove', phase: 'recover', points: 0, side });
  }

  private inputBlocked(): boolean {
    return this.cooldown > 0 || this.contact != null || this.trickCooldown > 0;
  }

  private trickBusy(): boolean {
    return this.trick != null && this.trick.phase !== 'recover' && this.trick.phase !== 'fail';
  }

  /** A headed ball lives in the juggle lane, in front of the player, not only on the authored forehead depth. */
  private headerLane(): boolean {
    const b = this.ball;
    const { depthTol, lateralTol } = this.config.tricks;
    const zOk = nearDepth(b.z, this.config.ballZ, depthTol + 0.08)
      || nearDepth(b.z, this.config.contacts.forehead.z, depthTol + 0.08);
    if (!zOk) return false;
    if (Math.abs(b.x) > lateralTol + 0.2) return false;
    return Math.abs(b.x) <= this.config.courtHalfWidth;
  }

  private headerWindowOpen(): boolean {
    const y = this.config.contacts.forehead.y;
    if (this.ball.vy >= 0 || !this.headerLane()) return false;
    const dy = this.ball.y - y;
    // Ball centre on the hairline. Queued taps wait for this band instead of heading the air above it.
    if (dy > 0.045 || dy < -0.04) return false;
    return this.gradeFor(this.timingDeltaMs(y), this.config.timing.poorMs + 40) !== 'miss';
  }

  private headerWindowPassed(): boolean {
    const y = this.config.contacts.forehead.y;
    return this.ball.vy < 0 && this.ball.y < y - 0.18;
  }

  /**
   * A neck catch is timed on the way down through nape height. The ball is
   * still in the juggle lane (around ballZ); the catch then settles it on
   * the back of the neck. Placing the ball on the nape already also qualifies,
   * so scripted stalls and the live juggle share one window.
   */
  private neckApproach(): boolean {
    const b = this.ball;
    const lane = this.config.tricks.depthTol * 1.6;
    const inLane = nearDepth(b.z, this.config.ballZ, lane)
      || nearDepth(b.z, this.config.contacts.nape.z, this.config.tricks.depthTol);
    if (!inLane) return false;
    if (Math.abs(b.x) > this.config.tricks.lateralTol + 0.15) return false;
    return this.gradeFor(this.timingDeltaMs(this.config.contacts.nape.y), this.config.tricks.neckPrepMs) !== 'miss';
  }

  private neckWindowOpen(): boolean {
    return this.ball.vy < 0 && this.neckApproach();
  }

  private neckWindowPassed(): boolean {
    const y = this.config.contacts.nape.y;
    return this.ball.vy < 0 && this.ball.y < y - 0.2;
  }

  private emitMiss(side: Side, deltaMs: number) {
    this.streak = 0;
    this.cooldown = this.config.missCooldown;
    this.lastKickGrade = 'miss';
    resetComboTracker(this.combos);
    this.emit({ type: 'miss', side, deltaMs });
  }

  /** Early means the ball has not reached the foot yet. A ball already below the foot is late. */
  private footTiming(): 'early' | 'late' | 'open' {
    const deltaMs = this.timingDeltaMs();
    if (this.gradeFor(deltaMs) !== 'miss') return 'open';
    if (!Number.isFinite(deltaMs)) return this.ball.y > this.config.contactHeight ? 'early' : 'late';
    return deltaMs < 0 ? 'late' : 'early';
  }

  private releaseCharge(side: Side, power: number) {
    if (this.phase !== 'playing' || this.inputBlocked() || this.selectedTrick) return;
    if (this.footTiming() !== 'open') return;
    this.tryKick(side, false, power);
  }

  private advanceKickCharge(h: number) {
    const charge = this.kickCharge;
    if (!charge || this.phase !== 'playing') return;
    if (!this.held[charge.side]) {
      this.kickCharge = null;
      return;
    }
    charge.held += h;
    charge.power = Math.min(1, charge.held / Math.max(0.05, this.config.kickChargeTime));
    if (this.inputBlocked() || this.selectedTrick) return;
    const timing = this.footTiming();
    if (timing === 'late') {
      this.kickCharge = null;
      return;
    }
    if (timing === 'early') return;
    const { side, power } = charge;
    this.kickCharge = null;
    this.tryKick(side, false, power);
  }

  private releaseGuards() {
    const b = this.ball;
    if (this.headerGuard && b.vy > 0 && b.y > this.config.contacts.forehead.y + 0.2) this.headerGuard = false;
    if (this.neckGuard && b.vy > 0 && b.y > this.config.contacts.nape.y + 0.25) this.neckGuard = false;
  }

  private footWindowReady(kind: FootTrick): boolean {
    if (kind === 'thigh') {
      const target = this.config.contacts.thigh;
      if (this.ball.vy >= 0 || !this.inContactBand(target)) return false;
      return this.gradeFor(this.timingDeltaMs(target.y)) !== 'miss';
    }
    if (this.ball.vy >= 0) return false;
    return this.gradeFor(this.timingDeltaMs()) !== 'miss';
  }

  private footWindowPassed(kind: FootTrick): boolean {
    const height = kind === 'thigh' ? this.config.contacts.thigh.y : this.config.contactHeight;
    if (this.ball.vy < 0 && this.ball.y < height - 0.28) return true;
    return this.timingDeltaMs(height) < -this.config.timing.poorMs;
  }

  private flushQueues() {
    if (this.phase !== 'playing') return;
    this.releaseGuards();
    this.flushHeader();
    this.flushNeck();
    this.flushFootQueue();
  }

  private flushHeader() {
    if (!this.queuedHeader || this.headerGuard || this.inputBlocked() || this.trickBusy()) return;
    const open = this.headerWindowOpen();
    const passed = this.headerWindowPassed();
    if (!open) {
      if (passed) this.queuedHeader = false;
      return;
    }
    this.queuedHeader = false;
    this.selectedTrick = 'header';
    this.tryHeader();
  }

  private flushNeck() {
    if (!this.queuedNeck || this.neckGuard || this.inputBlocked() || this.trickBusy()) return;
    const open = this.neckWindowOpen();
    const passed = this.neckWindowPassed();
    if (!open) {
      if (passed) this.queuedNeck = null;
      return;
    }
    const mode = this.queuedNeck;
    this.queuedNeck = null;
    this.heldNeck = mode === 'hold';
    this.selectedTrick = 'neckStall';
    this.tryNeckCatch();
    if (mode === 'tap' && this.trick?.kind === 'neckStall') {
      this.heldNeck = false;
      this.releaseNeckStall();
    }
  }

  private flushFootQueue() {
    const q = this.queuedFoot;
    if (!q || this.inputBlocked()) return;
    if (this.trick?.kind === 'aroundTheWorld') return;
    if (this.trickBusy()) return;
    if (!this.footWindowReady(q.kind)) {
      if (this.footWindowPassed(q.kind)) {
        this.queuedFoot = null;
        if (q.kind !== 'aroundTheWorld') this.selectedTrick = null;
      }
      return;
    }
    const score = this.stats.score;
    const trick = this.trick;
    this.selectedTrick = q.kind;
    this.tryAction(q.side);
    const started = this.contact != null || this.trick !== trick || this.stats.score !== score;
    if (!started) return;
    this.queuedFoot = null;
    if (q.kind !== 'aroundTheWorld') this.selectedTrick = null;
  }

  private applySpin(side: Side, power: number) {
    const dir = side === 'left' ? -1 : 1;
    const b = this.ball;
    b.wx = -9 * power;
    b.wy = 3 * dir;
    b.wz = -6 * dir * power;
  }

  /** Advance by a real frame duration; runs zero or more fixed steps. */
  update(frameSeconds: number) {
    this.acc += Math.min(frameSeconds, 0.1);
    const h = this.config.fixedStep;
    while (this.acc >= h) {
      this.step(h);
      this.acc -= h;
    }
  }

  step(h: number) {
    if (this.hitPause > 0) {
      const take = Math.min(h, this.hitPause);
      this.hitPause -= take;
      this.spinHeld(take);
      const rest = h - take;
      if (rest <= 1e-9) return;
      h = rest;
    }
    this.time += h;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - h);
    if (this.trickCooldown > 0) this.trickCooldown = Math.max(0, this.trickCooldown - h);
    if (this.celebration && this.time >= this.celebration.until) {
      this.finishCelebration(this.phase === 'playing');
    }
    const b = this.ball;

    if (this.phase === 'menu' || this.phase === 'ready') return;

    if (this.phase === 'playing' && !this.celebration) {
      const groove = this.trick;
      if (groove?.kind === 'groove' && groove.phase === 'execute'
        && this.time - groove.startedAt >= this.config.tricks.grooveFlightSec) {
        this.finishGrooveCatch(groove);
      }
      this.advanceKickCharge(h);
      this.flushQueues();
    }

    // Milestone dance: keep the ball where it is so the juggle can resume.
    if (this.celebration && this.phase === 'playing' && !this.contact) {
      b.vx = 0;
      b.vy = 0;
      b.vz = 0;
      b.rx += h * 1.2;
      return;
    }

    // Neck stall hold (logical upper-back contact).
    if (this.trick?.kind === 'neckStall' && (this.trick.phase === 'contact' || this.trick.phase === 'execute')) {
      this.trick.held += h;
      this.trick.phase = 'execute';
      b.x = this.config.contacts.nape.x ?? 0;
      b.y = this.config.contacts.nape.y;
      b.z = this.config.contacts.nape.z;
      b.vx = b.vy = b.vz = 0;
      b.wx *= 0.92; b.wy *= 0.92; b.wz *= 0.92;
      b.rx += b.wx * h; b.ry += b.wy * h; b.rz += b.wz * h;
      if (this.trick.held >= this.config.tricks.neckMaxHold) this.releaseNeckStall();
      else return;
      // Fall through to integrate after an auto-flick.
    }

    // Clear short recover markers once the ball is airborne again.
    if (this.trick && (this.trick.phase === 'recover' || this.trick.phase === 'fail')
      && this.trick.kind !== 'aroundTheWorld') {
      if (this.trick.kind === 'neckStall' && this.trick.phase === 'recover') {
        if (b.y > 2.05 && b.z < this.config.ballZ - 0.08) {
          b.vz = Math.max(b.vz, 1.35);
        }
        if (this.time - this.trick.startedAt > 0.7) this.trick = null;
      } else if (this.trick.kind === 'header') {
        if (this.time - this.trick.startedAt > 0.35) this.trick = null;
      } else if (this.trick.kind === 'groove') {
        // Release while the cushioned ball is still rising, so the next kick is live.
        if (this.trick.phase === 'recover' && this.time - this.trick.held > 0.16) this.trick = null;
      } else if (this.time - this.trick.startedAt > 0.35 || b.vy > 0.2) {
        this.trick = null;
      }
    }

    if (this.trick?.kind === 'aroundTheWorld' && this.trick.phase === 'recover') {
      if (this.time - this.trick.held > 0.18) {
        this.trick = null;
        this.selectedTrick = null;
      }
    }

    // Around the world stays a real parabola. The foot orbits while the ball is up,
    // then catches it as the flight ends. The ball is never parked in the air.
    if (this.trick?.kind === 'aroundTheWorld' && this.trick.phase === 'execute') {
      const dur = Math.max(0.05, this.config.tricks.atwRevolutionTime);
      this.trick.revolution = Math.min(1, (this.time - this.trick.startedAt) / dur);
      if (this.trick.revolution >= 1 - 1e-6) this.completeAtwCatch(this.trick);
    }

    const c = this.contact;
    if (c && this.phase === 'playing') {
      c.held += h;
      if (c.groove && c.held >= this.config.contactDelay - 1e-9) {
        this.completeContact(false);
      } else if (!this.held[c.side] && c.held >= this.config.contactDelay - 1e-9) {
        this.completeContact(c.kind === 'stall');
      } else if (c.thigh && c.held >= this.config.stallHoldTime) {
        // Thigh touches do not become foot stalls.
        this.completeContact(false);
      } else if (c.kind === 'pending' && c.held >= this.config.stallHoldTime) {
        c.kind = 'stall';
        this.emit({ type: 'stallStart', side: c.side });
      } else if (c.kind === 'stall' && c.held >= this.config.stallMaxTime) {
        this.completeContact(true);
      }
      if (this.contact) {
        b.wx *= 0.92; b.wy *= 0.92; b.wz *= 0.92;
        b.rx += b.wx * h; b.ry += b.wy * h; b.rz += b.wz * h;
        return;
      }
      // The strike landed in this step. Hold the ball here; the pause runs on the following steps
      // so this step's clock advance stays the contact instant and the clip does not jump.
      if (this.hitPause > 0) return;
    }

    if (this.phase === 'dropped') {
      this.dropClock += h;
      if (this.dropClock >= this.config.dropTime) {
        this.phase = 'over';
        this.emit({ type: 'over' });
      }
    }

    // Semi-implicit Euler integration.
    b.vy -= this.gravity * h;
    b.x += b.vx * h; b.y += b.vy * h; b.z += b.vz * h;
    b.rx += b.wx * h; b.ry += b.wy * h; b.rz += b.wz * h;

    const r = this.config.ballRadius;
    if (b.y <= r) {
      b.y = r;
      if (this.phase === 'playing') {
        if (this.trick) this.failTrick('drop');
        else resetComboTracker(this.combos);
        this.phase = 'dropped';
        this.dropClock = 0;
        this.streak = 0;
        this.lastDropTime = this.time;
        b.vy = Math.max(2.2, Math.abs(b.vy) * 0.35);
        b.vx *= 0.5;
        b.vz = 0.9;
        this.emit({ type: 'drop' });
      } else {
        b.vy = Math.abs(b.vy) * 0.45;
        b.vx *= 0.8; b.vz *= 0.8;
        if (b.vy < 0.4) b.vy = 0;
        b.wx *= 0.7; b.wy *= 0.7; b.wz *= 0.7;
      }
    }
  }
}

function emptyStats(): RunStats {
  return {
    score: 0,
    kickUps: 0,
    bestStreak: 0,
    stalls: 0,
    headers: 0,
    thighs: 0,
    neckStalls: 0,
    aroundTheWorlds: 0,
    highFlicks: 0,
    grooves: 0,
    combos: 0,
  };
}
