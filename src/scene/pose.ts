import type { GameEngine } from '../engine/engine';
import type { Side } from '../engine/config';

export interface LegPose {
  /** Thigh rotation about X (negative = forward). */
  thigh: number;
  /** Knee bend (positive = shin swings back). */
  knee: number;
  /** Leg rotation about Z (sideways). */
  abduct: number;
  /** Foot pitch. */
  foot: number;
}

/**
 * Renderer-agnostic description of the footballer's pose. The placeholder primitive
 * rig (Character.tsx) consumes it, and a future GLB rig can map the same values to
 * its bones or choose animation clips from it.
 */
export interface Pose {
  bodyY: number;
  bodyYaw: number;
  torsoPitch: number;
  torsoRoll: number;
  headYaw: number;
  headPitch: number;
  breathe: number;
  /** Outward arm angles about Z (positive = raised away from the body). */
  armLeft: number;
  armRight: number;
  armLeftPitch: number;
  armRightPitch: number;
  legs: Record<Side, LegPose>;
}

const HIP_Y = 0.95;
const THIGH = 0.42;
const SHIN = 0.45;
const HIP_X = 0.1;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function solveLeg(side: Side, target: { x: number; y: number; z: number }): LegPose {
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
    abduct: Math.atan2(dx, d) * (side === 'left' ? 1 : 1),
    foot: thighFwd - knee + 0.4,
  };
}

const REST: LegPose = { thigh: 0, knee: 0.04, abduct: 0, foot: 0 };

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function lerpLeg(a: LegPose, b: LegPose, t: number): LegPose {
  return { thigh: lerp(a.thigh, b.thigh, t), knee: lerp(a.knee, b.knee, t), abduct: lerp(a.abduct, b.abduct, t), foot: lerp(a.foot, b.foot, t) };
}

/** Kick envelope: snaps to full extension at the contact instant, then eases out. */
function kickEnvelope(dt: number): number {
  if (dt < 0) return 0;
  if (dt < 0.04) return dt / 0.04;
  return Math.exp(-(dt - 0.04) / 0.14);
}

export function computePose(engine: GameEngine, out: Pose = createPose()): Pose {
  const t = engine.time;
  const b = engine.ball;
  const c = engine.config;
  const phase = engine.phase;
  const active = phase === 'playing' || phase === 'dropped' || phase === 'over';

  // Head tracks the ball.
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
    const held = engine.contact && engine.contact.side === side;
    const env = held ? 1 : kickEnvelope(t - engine.lastKick[side]);
    if (env <= 0.001) continue;
    const bx = held ? b.x : (side === 'left' ? -1 : 1) * c.footX * 0.6;
    const stallLift = held && engine.contact!.kind === 'stall' ? 0.02 * Math.sin(t * 18) : 0;
    const target = { x: bx, y: c.contactHeight - 0.17 + stallLift, z: c.ballZ - 0.2 };
    // Follow-through: foot continues up and forward as the envelope decays.
    const follow = held ? 0 : (1 - env) * 0.18;
    target.y += follow;
    target.z += follow * 0.5;
    out.legs[side] = lerpLeg(REST, solveLeg(side, target), Math.min(1, env));
    // Opposite arm counter-swing and body lean into the kick.
    const sign = side === 'left' ? 1 : -1;
    out.torsoPitch += 0.12 * env;
    out.torsoRoll += sign * 0.05 * env;
    out.bodyYaw += sign * 0.12 * env;
    if (side === 'left') out.armRight += 0.35 * env; else out.armLeft += 0.35 * env;
    out.bodyY -= 0.03 * env;
  }

  // Celebration after a perfect kick.
  const cel = t - engine.lastPerfectTime;
  if (cel >= 0 && cel < 0.7 && phase === 'playing') {
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
    bodyY: 0, bodyYaw: 0, torsoPitch: 0, torsoRoll: 0, headYaw: 0, headPitch: 0, breathe: 0,
    armLeft: 0, armRight: 0, armLeftPitch: 0, armRightPitch: 0,
    legs: { left: { ...REST }, right: { ...REST } },
  };
}
