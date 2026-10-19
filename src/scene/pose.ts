import type { GameEngine } from '../engine/engine';
import type { Side } from '../engine/config';
import { V2_LIMBS, visualContactPoint } from './limbCalibration';

export interface LegPose {
  /** Thigh rotation about X (negative = forward). */
  thigh: number;
  /** Knee bend (positive = shin swings back). */
  knee: number;
  /** Leg rotation about Z (sideways). */
  abduct: number;
  /** Hip twist about Y — used for around-the-world circle. */
  twist: number;
  /** Foot pitch. */
  foot: number;
  /** Ankle roll (about Z). */
  ankleRoll: number;
  /** Ankle yaw (about Y). */
  ankleYaw: number;
}

/**
 * Renderer-agnostic description of the footballer's pose. The placeholder primitive
 * rig (Character.tsx) consumes it, and the GLB rig maps the same values to bones.
 */
export interface Pose {
  bodyY: number;
  bodyYaw: number;
  torsoPitch: number;
  torsoYaw: number;
  torsoRoll: number;
  neckPitch: number;
  neckYaw: number;
  headYaw: number;
  headPitch: number;
  breathe: number;
  /** Outward arm angles about Z (positive = raised away from the body). */
  armLeft: number;
  armRight: number;
  armLeftPitch: number;
  armRightPitch: number;
  elbowLeft: number;
  elbowRight: number;
  legs: Record<Side, LegPose>;
  /** When true, expressive motion must not override this pose (active trick contact). */
  lockMotion: boolean;
}

const HIP_Y = V2_LIMBS.pelvisY;
const THIGH = V2_LIMBS.thigh;
const SHIN = V2_LIMBS.shin;
const HIP_X = V2_LIMBS.hipX * 0.9;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function solveLeg(side: Side, target: { x: number; y: number; z: number }): LegPose {
  const hipX = side === 'left' ? -HIP_X : HIP_X;
  const f = target.z;
  const d = Math.max(0.05, HIP_Y - target.y);
  const D = clamp(Math.hypot(f, d), Math.abs(THIGH - SHIN) + 0.01, THIGH + SHIN - 0.005);
  const kneeInterior = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - D * D) / (2 * THIGH * SHIN), -1, 1));
  const alpha = Math.acos(clamp((THIGH * THIGH + D * D - SHIN * SHIN) / (2 * THIGH * D), -1, 1));
  const phi = Math.atan2(f, d);
  const thighFwd = phi + alpha;
  const knee = Math.PI - kneeInterior;
  const dx = target.x - hipX;
  return {
    thigh: -thighFwd,
    knee,
    abduct: Math.atan2(dx, d),
    twist: 0,
    foot: thighFwd - knee + 0.4,
    ankleRoll: 0,
    ankleYaw: 0,
  };
}

const REST: LegPose = { thigh: 0, knee: 0.04, abduct: 0, twist: 0, foot: 0, ankleRoll: 0, ankleYaw: 0 };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpLeg(a: LegPose, b: LegPose, t: number): LegPose {
  return {
    thigh: lerp(a.thigh, b.thigh, t),
    knee: lerp(a.knee, b.knee, t),
    abduct: lerp(a.abduct, b.abduct, t),
    twist: lerp(a.twist, b.twist, t),
    foot: lerp(a.foot, b.foot, t),
    ankleRoll: lerp(a.ankleRoll, b.ankleRoll, t),
    ankleYaw: lerp(a.ankleYaw, b.ankleYaw, t),
  };
}

/** Kick envelope: snaps to full extension at the contact instant, then eases out. */
export function kickEnvelope(dt: number): number {
  if (dt < 0) return 0;
  if (dt < 0.04) return dt / 0.04;
  return Math.exp(-(dt - 0.04) / 0.14);
}

function softKnees(out: Pose, amount: number) {
  out.legs.left.knee += 0.22 * amount;
  out.legs.right.knee += 0.22 * amount;
  out.legs.left.thigh += 0.08 * amount;
  out.legs.right.thigh += 0.08 * amount;
  out.bodyY -= 0.04 * amount;
}

/** Header / neck / ATW / thigh / high-flick body language. Samples engine.time only. */
function applyTrickPose(engine: GameEngine, out: Pose, t: number) {
  const trick = engine.trick;
  const selected = engine.selectedTrick;
  const b = engine.ball;
  const c = engine.config;
  const contacts = c.contacts;

  // Anticipation while a header is armed and the ball is descending toward the forehead.
  if (selected === 'header' && !trick && engine.phase === 'playing' && b.vy < 0) {
    const eta = engine.timeToContact(b.y, b.vy, contacts.forehead.y);
    if (eta < 0.55 && Number.isFinite(eta)) {
      const k = clamp(1 - eta / 0.55, 0, 1);
      softKnees(out, 0.55 * k);
      out.torsoPitch += 0.1 * k;
      out.headPitch = lerp(out.headPitch, -0.18, k);
      out.armLeft += 0.12 * k;
      out.armRight += 0.12 * k;
      out.lockMotion = k > 0.35;
    }
  }

  if (!trick) {
    // High-flick / thigh / ATW armed: light ready posture before the foot action.
    if (selected === 'highFlick' && engine.phase === 'playing') {
      out.torsoPitch += 0.04;
      out.armLeftPitch += 0.05;
      out.armRightPitch += 0.05;
    }
    return;
  }

  out.lockMotion = true;

  if (trick.kind === 'header') {
    const age = t - trick.startedAt;
    const hit = clamp(age / 0.08, 0, 1);
    const recover = age > 0.12 ? clamp((age - 0.12) / 0.35, 0, 1) : 0;
    softKnees(out, 0.65 * (1 - recover));
    out.torsoPitch += lerp(0.22, 0.04, recover);
    out.neckPitch = lerp(-0.05, 0.02, recover);
    // Meet with the forehead — modest pitch, no neck snap.
    out.headPitch = lerp(-0.22, out.headPitch * 0.3, recover);
    out.headYaw *= 1 - hit * 0.7;
    out.armLeft = lerp(0.55, out.armLeft, recover);
    out.armRight = lerp(0.55, out.armRight, recover);
    out.elbowLeft = lerp(0.35, 0, recover);
    out.elbowRight = lerp(0.35, 0, recover);
    out.bodyY += 0.03 * hit * (1 - recover);
    return;
  }

  if (trick.kind === 'neckStall') {
    const hold = trick.phase === 'contact' || trick.phase === 'execute';
    const release = trick.phase === 'recover' || (trick.phase === 'execute' && b.vy > 0.4);
    // Snap into the hinged catch immediately, then settle with hold time.
    const k = hold ? clamp(0.65 + trick.held / 0.2, 0, 1) : 1;
    const rel = release ? clamp((t - trick.startedAt - trick.held) / 0.25, 0, 1) : 0;
    softKnees(out, lerp(0.75, 0.2, rel));
    // Hinge forward, face down — ball sits on upper back behind the neck, not the face.
    out.torsoPitch = lerp(0.55 * k, 0.12, rel);
    out.neckPitch = lerp(0.45 * k, 0.05, rel);
    out.headPitch = lerp(0.55 * k, 0.1, rel);
    out.headYaw = 0;
    out.armLeft = lerp(1.15 * k, 0.35, rel);
    out.armRight = lerp(1.15 * k, 0.35, rel);
    out.armLeftPitch = lerp(-0.35 * k, 0, rel);
    out.armRightPitch = lerp(-0.35 * k, 0, rel);
    out.elbowLeft = lerp(0.55 * k, 0.1, rel);
    out.elbowRight = lerp(0.55 * k, 0.1, rel);
    out.bodyY -= 0.06 * k * (1 - rel);
    out.bodyYaw = 0;
    return;
  }

  if (trick.kind === 'aroundTheWorld') {
    const side = trick.side ?? 'left';
    const other: Side = side === 'left' ? 'right' : 'left';
    const rev = clamp(trick.revolution, 0, 1);
    const angle = rev * Math.PI * 2 * (side === 'left' ? 1 : -1);
    const radius = 0.28;
    // Support foot planted.
    out.legs[other] = { ...REST, knee: 0.08, thigh: 0.05 };
    const ballPoint = visualContactPoint(
      { x: b.x, y: b.y, z: b.z },
      { x: 0, y: HIP_Y, z: 0 },
      c.ballRadius,
    );
    const target = {
      x: ballPoint.x + Math.sin(angle) * radius * (side === 'left' ? -1 : 1),
      y: clamp(ballPoint.y - 0.02 + Math.sin(angle * 0.5) * 0.04, 0.35, 1.15),
      z: ballPoint.z + Math.cos(angle) * radius * 0.55 - 0.05,
    };
    const circling = solveLeg(side, target);
    circling.twist = angle * 0.55;
    circling.ankleYaw = angle * 0.35;
    circling.ankleRoll = Math.sin(angle) * 0.25;
    circling.foot += Math.cos(angle) * 0.15;
    // Clamp impossible splits.
    circling.thigh = clamp(circling.thigh, -1.35, 0.35);
    circling.knee = clamp(circling.knee, 0.05, 2.1);
    circling.abduct = clamp(circling.abduct, -0.55, 0.55);
    out.legs[side] = circling;
    out.torsoPitch += 0.08;
    out.torsoYaw = (side === 'left' ? 1 : -1) * 0.12 * Math.sin(angle);
    out.torsoRoll = (side === 'left' ? 1 : -1) * 0.06;
    out.armLeft = 0.45 + (side === 'right' ? 0.25 : 0);
    out.armRight = 0.45 + (side === 'left' ? 0.25 : 0);
    out.bodyYaw = (side === 'left' ? 1 : -1) * 0.1 * Math.sin(angle);
    if (trick.phase === 'recover') {
      softKnees(out, 0.2);
      out.headPitch = clamp(out.headPitch, -0.4, 0.3);
    }
    return;
  }

  if (trick.kind === 'thigh') {
    const side = trick.side ?? (engine.contact?.side ?? 'left');
    const other: Side = side === 'left' ? 'right' : 'left';
    const env = engine.contact
      ? clamp(0.55 + engine.contact.held / Math.max(c.contactDelay, 0.01), 0, 1)
      : Math.max(0.55, kickEnvelope(t - (engine.lastContact[side] ?? t)));
    out.legs[other] = { ...REST, knee: 0.1, thigh: 0.06 };
    const target = {
      x: (side === 'left' ? -1 : 1) * c.footX * 0.35,
      y: contacts.thigh.y - 0.2,
      z: contacts.thigh.z - 0.12,
    };
    const raised = solveLeg(side, target);
    raised.thigh = clamp(raised.thigh - 0.15, -1.2, 0.2);
    raised.knee = clamp(raised.knee + 0.25, 0.2, 1.8);
    raised.foot = 0.35;
    out.legs[side] = lerpLeg(REST, raised, Math.min(1, env));
    out.torsoPitch += 0.1 * env;
    out.torsoRoll += (side === 'left' ? 1 : -1) * 0.06 * env;
    out.armLeft += (side === 'right' ? 0.25 : 0.1) * env;
    out.armRight += (side === 'left' ? 0.25 : 0.1) * env;
    return;
  }
}

function applyHighFlickFollowThrough(engine: GameEngine, out: Pose, t: number) {
  if (engine.stats.highFlicks <= 0) return;
  // Find the most recent high-flick foot contact via lastKick that matched a highFlick contact completion.
  const side: Side = engine.lastKick.left >= engine.lastKick.right ? 'left' : 'right';
  const since = t - engine.lastContact[side];
  if (since < 0 || since > 0.45) return;
  // Only accent when the last scored kick was a high flick (no trick state left).
  if (engine.selectedTrick === 'highFlick') return;
  if (engine.contact?.highFlick) {
    // Scoop while trapped briefly.
    const scoop = solveLeg(side, {
      x: (side === 'left' ? -1 : 1) * engine.config.footX * 0.55,
      y: engine.config.contactHeight - 0.05,
      z: engine.config.ballZ + 0.05,
    });
    scoop.foot = -0.35;
    scoop.ankleYaw = (side === 'left' ? 1 : -1) * 0.2;
    out.legs[side] = lerpLeg(out.legs[side], scoop, 0.85);
    out.torsoPitch += 0.15;
    return;
  }
  if (engine.lastTrick?.kind === 'highFlick' || (since < 0.45 && engine.stats.highFlicks > 0 && !engine.trick)) {
    // Heuristic: recent contact with high ball velocity after a flick.
    if (engine.ball.vy < engine.config.kickSpeed * 1.05) return;
    const follow = kickEnvelope(since);
    if (follow < 0.05) return;
    const target = {
      x: (side === 'left' ? -1 : 1) * engine.config.footX * 0.5,
      y: engine.config.contactHeight + 0.35 * follow,
      z: engine.config.ballZ + 0.25 * follow,
    };
    const scooped = solveLeg(side, target);
    scooped.foot = -0.45 * follow;
    scooped.ankleRoll = (side === 'left' ? -1 : 1) * 0.15 * follow;
    out.legs[side] = lerpLeg(out.legs[side], scooped, follow);
    out.torsoPitch += 0.18 * follow;
    out.armLeft += 0.2 * follow;
    out.armRight += 0.2 * follow;
    out.lockMotion = follow > 0.2;
  }
}

export function computePose(engine: GameEngine, out: Pose = createPose()): Pose {
  const t = engine.time;
  const b = engine.ball;
  const c = engine.config;
  const phase = engine.phase;
  const active = phase === 'playing' || phase === 'dropped' || phase === 'over';

  out.lockMotion = false;
  out.torsoYaw = 0;
  out.neckPitch = 0;
  out.neckYaw = 0;
  out.elbowLeft = 0;
  out.elbowRight = 0;

  // Head tracks the ball unless a trick locks orientation.
  const headY = 1.62;
  const dx = active ? b.x : 0;
  const dy = (active ? b.y : 0.3) - headY;
  const dz = active ? b.z : c.ballZ;
  const yaw = Math.atan2(dx, dz);
  const pitch = -Math.atan2(dy, Math.hypot(dx, dz));
  out.headYaw = clamp(yaw, -0.7, 0.7);
  out.headPitch = clamp(pitch + 0.1, -0.7, 0.7);

  const breathe = Math.sin(t * 2.4);
  out.breathe = breathe;
  out.bodyY = breathe * 0.006;
  out.bodyYaw = 0;
  out.torsoPitch = 0.02;
  out.torsoRoll = 0;
  out.armLeft = 0.22 + breathe * 0.02;
  out.armRight = 0.22 + breathe * 0.02;
  out.armLeftPitch = 0;
  out.armRightPitch = 0;
  out.legs.left = { ...REST };
  out.legs.right = { ...REST };

  if (active) {
    out.torsoRoll = clamp(-b.x * 0.18, -0.12, 0.12);
  }

  // Foot contact: IK leg to the ball position at the instant of contact.
  const sides: Side[] = ['left', 'right'];
  for (const side of sides) {
    const held = engine.contact && engine.contact.side === side && !engine.contact.thigh;
    const sinceTap = t - engine.lastKick[side];
    const sinceContact = t - engine.lastContact[side];
    const env = held
      ? Math.min(1, Math.max(0, sinceTap) / c.contactDelay)
      : engine.lastContact[side] >= engine.lastKick[side]
        ? Math.exp(-Math.max(0, sinceContact) / 0.14)
        : kickEnvelope(sinceTap);
    if (env <= 0.001) continue;
    // Skip normal kick IK when ATW owns the circling foot.
    if (engine.trick?.kind === 'aroundTheWorld' && engine.trick.side === side) continue;
    if (engine.trick?.kind === 'thigh' && engine.trick.side === side) continue;
    if (engine.contact?.thigh && engine.contact.side === side) continue;

    const bx = held ? b.x : (side === 'left' ? -1 : 1) * c.footX * 0.6;
    const stallLift = held && engine.contact!.kind === 'stall' ? 0.02 * Math.sin(t * 18) : 0;
    const highScoop = held && engine.contact!.highFlick ? 0.12 : 0;
    const target = { x: bx, y: c.contactHeight - 0.17 + stallLift + highScoop, z: c.ballZ - 0.2 + (highScoop ? 0.08 : 0) };
    const follow = held ? 0 : (1 - env) * 0.18;
    target.y += follow + (engine.contact?.highFlick || (!held && engine.ball.vy > c.kickSpeed * 1.05) ? follow * 0.8 : 0);
    target.z += follow * 0.5;
    const leg = solveLeg(side, target);
    if (held && engine.contact!.highFlick) {
      leg.foot = -0.4;
      leg.ankleYaw = (side === 'left' ? 1 : -1) * 0.25;
    }
    out.legs[side] = lerpLeg(REST, leg, Math.min(1, env));
    const sign = side === 'left' ? 1 : -1;
    out.torsoPitch += 0.12 * env;
    out.torsoRoll += sign * 0.05 * env;
    out.bodyYaw += sign * 0.12 * env;
    if (side === 'left') out.armRight += 0.35 * env; else out.armLeft += 0.35 * env;
    out.bodyY -= 0.03 * env;
  }

  applyTrickPose(engine, out, t);
  applyHighFlickFollowThrough(engine, out, t);

  // Celebration after a perfect kick — suppressed during active trick contact.
  const cel = t - engine.lastPerfectTime;
  if (!out.lockMotion && cel >= 0 && cel < 0.7 && phase === 'playing') {
    const k = Math.sin((cel / 0.7) * Math.PI);
    out.armLeft = lerp(out.armLeft, 2.7, k);
    out.armRight = lerp(out.armRight, 2.7, k);
    out.bodyY += 0.08 * k;
  }

  // Dejection after the ball drops.
  const sad = t - engine.lastDropTime;
  if (sad >= 0 && (phase === 'dropped' || phase === 'over')) {
    const k = Math.min(1, sad / 0.25);
    out.torsoPitch += 0.3 * k;
    out.headPitch = lerp(out.headPitch, 0.5, k);
    out.armLeft = lerp(out.armLeft, 0.05, k);
    out.armRight = lerp(out.armRight, 0.05, k);
    out.armLeftPitch = out.armRightPitch = 0.2 * k;
    out.bodyY -= 0.04 * k;
  }

  return out;
}

export function createPose(): Pose {
  return {
    bodyY: 0, bodyYaw: 0, torsoPitch: 0, torsoYaw: 0, torsoRoll: 0,
    neckPitch: 0, neckYaw: 0, headYaw: 0, headPitch: 0, breathe: 0,
    armLeft: 0, armRight: 0, armLeftPitch: 0, armRightPitch: 0,
    elbowLeft: 0, elbowRight: 0,
    legs: { left: { ...REST }, right: { ...REST } },
    lockMotion: false,
  };
}
