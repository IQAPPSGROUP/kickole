import { GameEngine } from '../engine/engine';
import type { Side } from '../engine/config';
import { KICK_CLIP_START } from './rig';

/**
 * Development-only animation inspector state (enabled with ?inspect in dev builds).
 * While active the game loop does not advance the engine; the scene is rebuilt deterministically for each scrub position
 * by replaying the real engine, so what is shown is exactly what the game would show at that moment.
 */
export const inspector = {
  active: false,
  /** Foot bone world position of the kicking foot (set by the GLB character). */
  foot: null as [number, number, number] | null,
};

export type InspectMode = 'kick' | 'stall';

export interface InspectInfo {
  /** Seconds since the tap (negative = before the tap). */
  sinceTap: number;
  /** Seconds from the tap to the ball response (null while the ball is still trapped / not yet kicked). */
  contactAt: number | null;
  ball: { x: number; y: number; z: number; vy: number };
  phase: string;
}

/** Stall scenario: the control is released this long after the tap. */
export const STALL_RELEASE_AFTER = 0.6;

/**
 * Put `engine` into the state it would have `sinceTap` seconds after a perfectly timed tap with `side`.
 * `kick` taps and releases immediately; `stall` holds the control for STALL_RELEASE_AFTER seconds.
 */
export function buildScenario(engine: GameEngine, side: Side, mode: InspectMode, sinceTap: number): InspectInfo {
  const h = engine.config.fixedStep;
  engine.prepare('ready');
  engine.time = 0;
  engine.press(side === 'left' ? 'right' : 'left');
  engine.release(side === 'left' ? 'right' : 'left');
  let guard = 0;
  while (!(engine.ball.vy < 0 && engine.timingDeltaMs() <= 0) && guard++ < 100000) engine.step(h);
  const tapAt = engine.time;
  const target = tapAt + sinceTap;
  let pressed = false;
  let released = false;
  let contactAt: number | null = null;
  const off = engine.on((e) => { if (e.type === 'kick') contactAt = engine.time - tapAt; });
  // Advance in fixed steps; the tap happens on the first step at or after tapAt.
  while (engine.time < target - 1e-9) {
    if (!pressed && engine.time >= tapAt - 1e-9) { engine.press(side); pressed = true; if (mode === 'kick') { engine.release(side); released = true; } }
    if (mode === 'stall' && pressed && !released && engine.time - tapAt >= STALL_RELEASE_AFTER - 1e-9) { engine.release(side); released = true; }
    engine.step(h);
  }
  if (!pressed && sinceTap >= 0 && engine.time >= tapAt - 1e-9) { engine.press(side); pressed = true; if (mode === 'kick') engine.release(side); }
  off();
  const b = engine.ball;
  return { sinceTap: engine.time - tapAt, contactAt, ball: { x: b.x, y: b.y, z: b.z, vy: b.vy }, phase: engine.phase };
}

/** Clip time shown for a given time since the tap in a plain (non-held) kick. */
export const clipTimeAtTap = (sinceTap: number) => KICK_CLIP_START + sinceTap;
