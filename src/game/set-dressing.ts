import type { SceneId } from './scenes';

/** Kick-circle box the props must stay out of: |x| < 1.6 and z from -0.8 to 1.6. */
export function outsideKickCircle(x: number, z: number): boolean {
  return Math.abs(x) >= 1.6 || z < -0.8 || z > 1.6;
}

export interface PropPose {
  x: number;
  y: number;
  z: number;
  spin: number;
  /** Which loop of the bounce this instant belongs to. A pop lasts until the next one. */
  loop: number;
}

export const BEACH_BALL_LOOP = 5.6;
/** Closest the decorative ball comes to the origin, still outside the kick circle. Left of the player, in frame. */
export const BEACH_BALL_INNER_X = 1.72;
export const POP_BONUS = 5;
/** Metres. Wide enough that a kick clips the ball when it has bounced in, not when it is out wide. */
export const POP_NEAR = 2.2;

/** Bounces in from the left sideline, in front of the camera, and back out. */
export function beachBallPose(time: number): PropPose {
  const safe = Number.isFinite(time) ? time : 0;
  const loop = Math.floor(safe / BEACH_BALL_LOOP);
  const u = (safe - loop * BEACH_BALL_LOOP) / BEACH_BALL_LOOP;
  const inward = u < 0.55 ? u / 0.55 : 1 - (u - 0.55) / 0.45;
  const x = -(BEACH_BALL_INNER_X + (1 - inward) * 0.9);
  const z = -0.45;
  const bounce = Math.abs(Math.sin(inward * Math.PI * 3));
  const y = 0.28 + bounce * (0.35 + inward * 0.7);
  return { x, y, z, spin: safe * 3.4, loop };
}

/** Gull crossing the sky above the palms, inside the beach camera frame. */
export function birdPose(time: number): { x: number; y: number; z: number; flap: number } {
  const loop = 16;
  const u = ((time % loop) + loop) % loop / loop;
  return {
    x: -2.15 + u * 2.05,
    y: 2.55 + Math.sin(u * Math.PI * 2) * 0.1,
    z: -3.25,
    flap: Math.sin(time * 9),
  };
}

export const CROWD: Record<SceneId, ReadonlyArray<{ x: number; z: number }>> = {
  beach: [
    { x: -2.35, z: 2.3 },
    { x: 2.55, z: 2.45 },
    { x: -2.7, z: -2.15 },
  ],
  rua: [
    { x: -2.4, z: 2.2 },
    { x: 2.6, z: -2.3 },
  ],
};

export interface BallFlight {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
  /** Scene clock the decorative ball is using, seconds. */
  time: number;
}

/**
 * +5 when the kicked ball's arc passes near the decorative beach ball, once per bounce loop.
 * The decorative ball is not a collider: the flight given here is not altered.
 */
export function kickClipsBeachBall(flight: BallFlight, alreadyLoop: number): { bonus: number; loop: number } {
  const samples = 12;
  const gravity = flight.gravity > 0 ? flight.gravity : 11;
  const flightTime = flight.vy > 0 ? (2 * flight.vy) / gravity : 0.35;
  for (let i = 0; i <= samples; i++) {
    const t = (flightTime * i) / samples;
    const x = flight.x + flight.vx * t;
    const y = flight.y + flight.vy * t - 0.5 * gravity * t * t;
    const z = flight.z + flight.vz * t;
    const prop = beachBallPose(flight.time + t);
    if (prop.loop === alreadyLoop) continue;
    const dx = x - prop.x;
    const dy = y - prop.y;
    const dz = z - prop.z;
    if (dx * dx + dy * dy + dz * dz <= POP_NEAR * POP_NEAR) return { bonus: POP_BONUS, loop: prop.loop };
  }
  return { bonus: 0, loop: alreadyLoop };
}
