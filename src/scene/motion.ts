import type { GameEngine } from '../engine/engine';

/** Small additive movements. Authored kick legs and every physics value stay authoritative. */
export interface PlayerMotion {
  name: 'relaxed-sway' | 'ready-bounce' | 'ball-tracking' | 'open-touch' | 'counter-touch' | 'compact-touch' | 'stall-balance' | 'fist-pump' | 'shoulder-shimmy' | 'salute' | 'miss-recovery';
  rootX: number; rootY: number; rootYaw: number;
  spineX: number; spineY: number; spineZ: number;
  headX: number; headY: number; headZ: number;
  leftX: number; leftY: number; leftZ: number;
  rightX: number; rightY: number; rightZ: number;
  leftFoot: number; rightFoot: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
function smooth(lo: number, hi: number, n: number) {
  const t = clamp((n - lo) / (hi - lo), 0, 1); return t * t * (3 - 2 * t);
}

export function createPlayerMotion(): PlayerMotion {
  return { name: 'relaxed-sway', rootX: 0, rootY: 0, rootYaw: 0, spineX: 0, spineY: 0, spineZ: 0,
    headX: 0, headY: 0, headZ: 0, leftX: 0, leftY: 0, leftZ: 0, rightX: 0, rightY: 0, rightZ: 0, leftFoot: 0, rightFoot: 0 };
}

/** Deterministic at an engine time; has no subscriptions, randomness, timers or engine writes. */
export function computePlayerMotion(engine: GameEngine, out = createPlayerMotion()): PlayerMotion {
  const t = engine.time, phase = engine.phase, b = engine.ball;
  out.name = 'relaxed-sway';
  out.rootX = out.rootY = out.rootYaw = 0;
  out.spineX = out.spineY = out.spineZ = 0;
  out.headX = out.headY = out.headZ = 0;
  out.leftX = out.leftY = out.leftZ = out.rightX = out.rightY = out.rightZ = 0;
  out.leftFoot = out.rightFoot = 0;

  if (phase === 'menu' || phase === 'ready') {
    const ready = phase === 'ready'; out.name = ready ? 'ready-bounce' : 'relaxed-sway';
    const beat = Math.sin(t * (ready ? 4.2 : 2.0)), sway = Math.sin(t * 1.25);
    out.rootX = .025 * sway; out.rootY = .009 * (1 + beat); out.rootYaw = .055 * sway;
    out.spineZ = -.035 * sway; out.spineY = -.04 * sway; out.spineX = ready ? .025 * beat : .012 * beat;
    out.headY = .12 * Math.sin(t * .8); out.headZ = .018 * Math.sin(t * 1.25 + .6);
    out.leftX = .12 * beat; out.rightX = -.12 * beat;
    out.leftZ = .06 + .04 * sway; out.rightZ = -.06 + .04 * sway;
    // Small ankle flex, only off-ball. Active kick/stall leg transforms are never accented.
    out.leftFoot = -.08 * Math.max(0, beat); out.rightFoot = -.08 * Math.max(0, -beat);
    return out;
  }

  if (phase === 'dropped' || phase === 'over') {
    out.name = 'miss-recovery';
    const age = Math.max(0, t - engine.lastDropTime), settle = 1 - Math.exp(-age * 4);
    const reaction = Math.sin(age * Math.PI / .85) * (1 - smooth(.7, 1.3, age));
    out.headY = .25 * Math.sin(age * 9) * Math.exp(-age * 1.8);
    out.leftZ = .24 * reaction; out.rightZ = -.24 * reaction;
    out.leftX = out.rightX = -.16 * reaction;
    out.spineZ = .035 * Math.sin(age * 2.4) * settle;
    out.rootY = -.012 * settle; return out;
  }

  out.name = 'ball-tracking';
  out.headY = clamp(Math.atan2(b.x, Math.max(.2, b.z)), -.6, .6);
  out.headX = clamp(-Math.atan2(b.y - 1.62, Math.hypot(b.x, b.z)), -.5, .45);
  out.spineY = clamp(b.x * .11, -.08, .08);
  const anticipation = b.vy < 0 ? (1 - smooth(.15, .36, engine.timeToContact())) : 0;
  out.spineX = .065 * anticipation;
  out.leftZ = .10 + .12 * anticipation; out.rightZ = -.10 - .12 * anticipation;
  out.leftX = .035 * Math.sin(t * 3.5); out.rightX = -.035 * Math.sin(t * 3.5);

  if (engine.contact?.kind === 'stall') {
    out.name = 'stall-balance';
    const age = Math.max(0, engine.contact.held - engine.config.stallHoldTime);
    const balance = smooth(0, .14, age), sign = engine.contact.side === 'left' ? 1 : -1;
    out.leftZ += balance * (.30 + .055 * Math.sin(age * 7));
    out.rightZ -= balance * (.30 - .055 * Math.sin(age * 7));
    out.spineZ = balance * (.045 * sign + .025 * Math.sin(age * 6));
    out.leftX += .16 * balance; out.rightX -= .16 * balance;
    out.headX *= .65; return out;
  }

  const side = engine.lastKick.left >= engine.lastKick.right ? 'left' : 'right';
  const age = t - engine.lastKick[side], sign = side === 'left' ? 1 : -1;
  const variant = engine.stats.kickUps % 3;
  if (age >= 0 && age < .55) {
    // A scored touch increments kickUps at response time; retain the same accent across that instant.
    const completed = engine.lastContact[side] >= engine.lastKick[side];
    const touchVariant = Math.max(0, engine.stats.kickUps - (completed ? 1 : 0)) % 3;
    const accent = Math.sin(Math.PI * age / .55);
    out.name = (['open-touch', 'counter-touch', 'compact-touch'] as const)[touchVariant];
    out.spineY += sign * accent * [.20, -.16, .10][touchVariant];
    out.spineZ = sign * accent * .06;
    out.leftX += accent * (sign > 0 ? -.16 : .30);
    out.rightX += accent * (sign > 0 ? .30 : -.16);
    out.leftZ += accent * [ .28, .15, .08 ][touchVariant];
    out.rightZ -= accent * [ .15, .28, .08 ][touchVariant];
    out.leftY = sign * accent * .14; out.rightY = sign * accent * -.14;
  }

  const celebrateAge = t - engine.lastPerfectTime - .35;
  if (celebrateAge >= 0 && celebrateAge < 1.2 && age >= .35) {
    const envelope = Math.sin(celebrateAge / 1.2 * Math.PI), pulse = Math.sin(celebrateAge * Math.PI * 4);
    out.name = (['fist-pump', 'shoulder-shimmy', 'salute'] as const)[variant];
    if (variant === 0) {
      out.rightX -= .65 * envelope; out.leftZ -= .55 * envelope;
      out.rightY = .25 * pulse * envelope; out.headZ = -.08 * envelope;
    } else if (variant === 1) {
      out.spineY = .24 * pulse * envelope; out.spineZ = .07 * Math.sin(celebrateAge * 10) * envelope;
      out.leftX += .30 * pulse * envelope; out.rightX -= .30 * pulse * envelope;
      out.leftZ -= .3 * envelope; out.rightZ += .3 * envelope;
    } else {
      out.leftX -= .50 * envelope; out.rightX -= .50 * envelope;
      out.headZ = .07 * envelope; out.spineY += .13 * envelope;
      out.leftY = .2 * envelope; out.rightY = -.2 * envelope;
    }
  }
  // During all live play the root and feet remain exactly at the authored transforms.
  // Torso, arms and head are descendants of Spine and cannot move the kicking leg.
  return out;
}
