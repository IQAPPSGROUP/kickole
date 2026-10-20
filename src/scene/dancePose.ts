import type { DanceId } from '../game/dances';
import type { Pose } from './pose';

/**
 * In-place dance poses sampled from the steel-band phase (0 on the beat, 1 on the next).
 * Cosmetic only: the ball simulation never reads this.
 * Moves are original: low sway, a smooth pendulum, a two-footed shuffle, a heel rock.
 */
export function applyDancePose(out: Pose, dance: DanceId, phase: number, intensity = 1): void {
  const wrapped = ((phase % 1) + 1) % 1;
  const angle = wrapped * Math.PI * 2;
  const k = Math.max(0, Math.min(1, intensity));
  switch (dance) {
    case 'sway':
      applySway(out, angle, k);
      break;
    case 'pendulum':
      applyPendulum(out, angle, k);
      break;
    case 'shuffle':
      applyShuffle(out, angle, k);
      break;
    case 'heelrock':
      applyHeelRock(out, angle, k);
      break;
    default: {
      const exhaustive: never = dance;
      void exhaustive;
      break;
    }
  }
  out.lockMotion = true;
}

/** Low weight shift. Knees stay under half a bend — not a high march. */
function applySway(out: Pose, angle: number, k: number) {
  const sway = Math.sin(angle);
  out.bodyYaw = 0.12 * sway * k;
  out.torsoRoll = 0.1 * sway * k;
  out.armLeft = 0.35 + 0.12 * Math.sin(angle) * k;
  out.armRight = 0.35 - 0.12 * Math.sin(angle) * k;
  out.elbowLeft = 0.22 * k;
  out.elbowRight = 0.24 * k;
  out.legs.left.knee = 0.16 + 0.22 * Math.max(0, sway) * k;
  out.legs.right.knee = 0.16 + 0.22 * Math.max(0, -sway) * k;
  out.legs.left.thigh = -0.1 * Math.max(0, sway) * k;
  out.legs.right.thigh = -0.1 * Math.max(0, -sway) * k;
  out.bodyY += 0.015 * Math.abs(sway) * k;
}

/** Smooth sine swing with soft elbows. Not a frozen right-angle pose. */
function applyPendulum(out: Pose, angle: number, k: number) {
  const swing = Math.sin(angle);
  out.armLeft = (0.5 + 0.28 * swing) * k;
  out.armRight = (0.5 - 0.28 * swing) * k;
  out.elbowLeft = (0.32 + 0.1 * Math.sin(angle * 2)) * k;
  out.elbowRight = (0.32 - 0.1 * Math.sin(angle * 2)) * k;
  out.torsoYaw = 0.08 * swing * k;
  out.headYaw = 0.1 * swing * k;
  out.legs.left.knee = 0.1 * k;
  out.legs.right.knee = 0.1 * k;
}

/** Both feet stay low and neither arm sticks up. */
function applyShuffle(out: Pose, angle: number, k: number) {
  const step = Math.sin(angle);
  out.torsoRoll = 0.05 * step * k;
  out.legs.left.thigh = -0.14 * k;
  out.legs.right.thigh = -0.14 * k;
  out.legs.left.knee = (0.2 + 0.18 * Math.max(0, step)) * k;
  out.legs.right.knee = (0.2 + 0.18 * Math.max(0, -step)) * k;
  out.legs.left.foot = 0.1 * step * k;
  out.legs.right.foot = -0.1 * step * k;
  out.armLeft = 0.38 * k;
  out.armRight = 0.4 * k;
  out.armLeftPitch = 0.06 * step * k;
  out.armRightPitch = -0.06 * step * k;
}

/** Small heel rock with crossed bent arms. The body does not spin a full turn. */
function applyHeelRock(out: Pose, angle: number, k: number) {
  const rock = Math.sin(angle);
  out.bodyYaw = 0.55 * rock * k;
  out.torsoYaw = -0.2 * rock * k;
  out.armLeft = 0.65 * k;
  out.armRight = 0.65 * k;
  out.elbowLeft = 1.1 * k;
  out.elbowRight = 1.1 * k;
  out.armLeftPitch = 0.4 * k;
  out.armRightPitch = -0.4 * k;
  out.legs.left.foot = 0.32 * Math.max(0, rock) * k;
  out.legs.right.foot = 0.32 * Math.max(0, -rock) * k;
  out.legs.left.knee = 0.18 * k;
  out.legs.right.knee = 0.18 * k;
  out.bodyY += 0.02 * Math.abs(rock) * k;
}

/** Extra knee or chest shape on the beat of a groove touch. */
export function accentGrooveTouch(
  out: Pose,
  side: 'left' | 'right',
  part: 'knee' | 'chest',
  amount: number,
) {
  const k = Math.max(0, Math.min(1, amount));
  if (part === 'knee') {
    out.legs[side].thigh = -1.2 * k;
    out.legs[side].knee = 1.3 * k;
    out.legs[side].foot = 0.25 * k;
    return;
  }
  out.torsoPitch += 0.18 * k;
  out.armLeft = Math.max(out.armLeft, 0.9 * k);
  out.armRight = Math.max(out.armRight, 0.9 * k);
  out.elbowLeft = Math.max(out.elbowLeft, 0.35 * k);
  out.elbowRight = Math.max(out.elbowRight, 0.35 * k);
}
