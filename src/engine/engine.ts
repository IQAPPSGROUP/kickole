import { DEFAULT_CONFIG, type GameConfig, type Grade, type Side } from './config';

export type Phase = 'menu' | 'ready' | 'playing' | 'dropped' | 'over';

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
  | { type: 'drop' }
  | { type: 'over' };

export interface RunStats {
  score: number;
  kickUps: number;
  bestStreak: number;
  stalls: number;
}

export interface Contact {
  kind: 'pending' | 'stall';
  side: Side;
  grade: Exclude<Grade, 'miss'>;
  deltaMs: number;
  held: number;
}

/**
 * Deterministic football juggling simulation. Knows nothing about React or three.js.
 * Advance with update(frameSeconds); feed input with press()/release().
 */
export class GameEngine {
  readonly config: GameConfig;
  phase: Phase = 'menu';
  ball: BallState;
  stats: RunStats = { score: 0, kickUps: 0, bestStreak: 0, stalls: 0 };
  streak = 0;
  lastSide: Side | null = null;
  /** Simulated time in seconds. */
  time = 0;
  /** Sim time of the most recent foot action per foot, for animation. */
  /** Time of the tap that started a foot action (the foot starts moving). */
  lastKick: Record<Side, number> = { left: -10, right: -10 };
  /** Time the ball actually responded to a kick (tap + contactDelay at the earliest). */
  lastContact: Record<Side, number> = { left: -10, right: -10 };
  lastKickGrade: Grade = 'good';
  lastDropTime = -10;
  lastPerfectTime = -10;
  contact: Contact | null = null;
  private acc = 0;
  private cooldown = 0;
  private dropClock = 0;
  private gravityScale = 1;
  private listeners = new Set<(e: EngineEvent) => void>();
  private held: Record<Side, boolean> = { left: false, right: false };

  constructor(config: Partial<GameConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      timing: { ...DEFAULT_CONFIG.timing, ...config.timing },
      scoring: { ...DEFAULT_CONFIG.scoring, ...config.scoring },
    };
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
    this.stats = { score: 0, kickUps: 0, bestStreak: 0, stalls: 0 };
    this.streak = 0;
    this.lastSide = null;
    this.contact = null;
    this.cooldown = 0;
    this.lastKick = { left: -10, right: -10 };
    this.lastContact = { left: -10, right: -10 };
    this.gravityScale = 1;
    this.acc = 0;
    this.held = { left: false, right: false };
  }

  /**
   * Seconds until the ball (descending) passes the contact height, from the given state.
   * Negative when it has already passed. Infinity if it never reaches it.
   */
  timeToContact(y = this.ball.y, vy = this.ball.vy): number {
    const g = this.gravity;
    const disc = vy * vy + 2 * g * (y - this.config.contactHeight);
    if (disc < 0) return Infinity;
    return (vy + Math.sqrt(disc)) / g;
  }

  /**
   * Signed ms error versus ideal contact (positive = early, negative = late).
   * Accounts for the part of the frame not yet simulated.
   */
  timingDeltaMs(): number {
    return (this.timeToContact() - this.acc) * 1000;
  }

  gradeFor(deltaMs: number): Grade {
    const a = Math.abs(deltaMs);
    const t = this.config.timing;
    if (a <= t.perfectMs) return 'perfect';
    if (a <= t.goodMs) return 'good';
    if (a <= t.poorMs) return 'poor';
    return 'miss';
  }

  press(side: Side) {
    if (this.held[side]) return;
    this.held[side] = true;
    if (this.phase === 'ready') this.launch(side);
    else if (this.phase === 'playing') this.tryKick(side);
  }

  release(side: Side) {
    this.held[side] = false;
    const c = this.contact;
    if (c && c.side === side && this.phase === 'playing' && c.held >= this.config.contactDelay) {
      this.completeContact(c.kind === 'stall');
    }
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

  private tryKick(side: Side) {
    if (this.cooldown > 0 || this.contact) return;
    const deltaMs = this.timingDeltaMs();
    const grade = this.gradeFor(deltaMs);
    this.lastKick[side] = this.time;
    if (grade === 'miss') {
      this.streak = 0;
      this.cooldown = this.config.missCooldown;
      this.lastKickGrade = 'miss';
      this.emit({ type: 'miss', side, deltaMs });
      return;
    }
    // The foot traps the ball; it becomes a normal kick on release, or a foot stall if held.
    this.contact = { kind: 'pending', side, grade, deltaMs, held: 0 };
    const b = this.ball;
    b.y = this.config.contactHeight;
    b.vx = b.vy = b.vz = 0;
    b.x = (side === 'left' ? -1 : 1) * this.config.footX * 0.6;
  }

  private completeContact(stall: boolean) {
    const c = this.contact;
    if (!c) return;
    this.contact = null;
    const { scoring } = this.config;
    const alternate = this.lastSide !== null && this.lastSide !== c.side;
    let points = scoring.kickUp;
    if (c.grade === 'perfect') points += scoring.perfectBonus;
    if (alternate) points += scoring.alternateBonus;
    if (stall) { points += scoring.footStall; this.stats.stalls++; }
    this.streak++;
    this.stats.kickUps++;
    this.stats.score += points;
    this.stats.bestStreak = Math.max(this.stats.bestStreak, this.streak);
    this.lastSide = c.side;
    this.lastContact[c.side] = this.time;
    this.lastKickGrade = c.grade;
    if (c.grade === 'perfect') this.lastPerfectTime = this.time;

    const quality = c.grade === 'perfect' || stall ? 1 : c.grade === 'good' ? 0.95 : 0.86;
    const b = this.ball;
    b.vy = this.config.kickSpeed * quality;
    this.gravityScale = Math.min(this.config.maxGravityScale, this.gravityScale + this.config.gravityRamp);
    const dir = c.side === 'left' ? -1 : 1;
    // Send the ball back towards the opposite side; poor contact sends it wide.
    const wide = c.grade === 'poor' ? dir * 0.28 : 0;
    const flight = (2 * b.vy) / this.gravity;
    const lim = this.config.courtHalfWidth;
    const targetX = Math.max(-lim, Math.min(lim, -dir * this.config.footX * 0.5 + wide));
    b.vx = (targetX - b.x) / flight;
    b.vz = 0;
    this.applySpin(c.side, quality);
    this.emit({ type: 'kick', side: c.side, grade: c.grade, points, alternate, stall, streak: this.streak, deltaMs: c.deltaMs });
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
    this.time += h;
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - h);
    const b = this.ball;

    if (this.phase === 'menu' || this.phase === 'ready') return;

    const c = this.contact;
    if (c && this.phase === 'playing') {
      c.held += h;
      if (!this.held[c.side] && c.held >= this.config.contactDelay - 1e-9) {
        this.completeContact(c.kind === 'stall');
      } else if (c.kind === 'pending' && c.held >= this.config.stallHoldTime) {
        c.kind = 'stall';
        this.emit({ type: 'stallStart', side: c.side });
      } else if (c.kind === 'stall' && c.held >= this.config.stallMaxTime) {
        this.completeContact(true);
      }
      if (this.contact) {
        // Ball balanced on the foot: no gravity, spin settles.
        b.wx *= 0.92; b.wy *= 0.92; b.wz *= 0.92;
        b.rx += b.wx * h; b.ry += b.wy * h; b.rz += b.wz * h;
        return;
      }
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
