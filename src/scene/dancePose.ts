import type { DanceId } from '../game/dances';
import type { Pose } from './pose';

/**
 * In-place dance poses sampled from the steel-band phase (0 on the beat, 1 on the next).
 * Cosmetic only: the ball simulation never reads this.
 */
export function applyDancePose(out: Pose, dance: DanceId, phase: number, intensity = 1): void {
  const wrapped = ((phase % 1) + 1) % 1;
  const angle = wrapped * Math.PI * 2;
  const k = Math.max(0, Math.min(1, intensity));
  switch (dance) {
    case 'samba':
      applySamba(out, angle, k);
      break;
    case 'robot':
      applyRobot(out, wrapped, k);
      break;
    case 'griddy':
      applyGriddy(out, angle, k);
      break;
    case 'spin':
      applySpin(out, wrapped, angle, k);
      break;
    default: {
      const exhaustive: never = dance;
      void exhaustive;
      break;
    }
  }
  out.lockMotion = true;
}

function applySamba(out: Pose, angle: number, k: number) {
  const sway = Math.sin(angle);
  out.bodyYaw = 0.2 * sway * k;
  out.torsoRoll = 0.14 * sway * k;
  out.torsoPitch = 0.05 * k;
  out.armLeft = 0.45 + 0.4 * Math.sin(angle + 0.6) * k;
  out.armRight = 0.45 + 0.4 * Math.sin(angle + Math.PI + 0.2) * k;
  out.elbowLeft = 0.45 * k;
  out.elbowRight = 0.5 * k;
  const left = Math.max(0, Math.sin(angle));
  const right = Math.max(0, Math.sin(angle + Math.PI));
  out.legs.left.thigh = -0.95 * left * k;
  out.legs.left.knee = 1.15 * left * k;
  out.legs.left.foot = 0.35 * left * k;
  out.legs.right.thigh = -0.95 * right * k;
  out.legs.right.knee = 1.15 * right * k;
  out.legs.right.foot = 0.35 * right * k;
  out.bodyY += 0.045 * Math.abs(sway) * k;
}

function applyRobot(out: Pose, phase: number, k: number) {
  const step = Math.min(3, Math.floor(phase * 4));
  const arm = [0.15, 1.05, 0.15, -0.25][step] ?? 0;
  out.armLeft = (0.85 + arm) * k;
  out.armRight = (0.85 - arm) * k;
  out.elbowLeft = (step % 2 === 0 ? 1.25 : 0.1) * k;
  out.elbowRight = (step % 2 === 1 ? 1.25 : 0.1) * k;
  out.torsoPitch = 0.02;
  out.torsoYaw = (step === 1 ? 0.22 : step === 3 ? -0.22 : 0) * k;
  out.headYaw = (step - 1.5) * 0.18 * k;
  out.headPitch = step % 2 === 0 ? -0.08 * k : 0.12 * k;
  out.legs.left.knee = step === 0 ? 0.95 * k : 0.04;
  out.legs.right.knee = step === 2 ? 0.95 * k : 0.04;
  out.legs.left.thigh = step === 0 ? -0.75 * k : 0;
  out.legs.right.thigh = step === 2 ? -0.75 * k : 0;
  out.bodyY += step % 2 === 0 ? 0.02 * k : 0;
}

function applyGriddy(out: Pose, angle: number, k: number) {
  const side = Math.sin(angle) >= 0 ? 1 : -1;
  out.torsoRoll = 0.18 * side * k;
  out.bodyYaw = 0.14 * side * k;
  out.legs.left.abduct = 0.28 * side * k;
  out.legs.right.abduct = 0.22 * side * k;
  out.legs.left.thigh = side > 0 ? -1.1 * k : -0.08 * k;
  out.legs.left.knee = side > 0 ? 1.4 * k : 0.12 * k;
  out.legs.right.thigh = side < 0 ? -1.1 * k : -0.08 * k;
  out.legs.right.knee = side < 0 ? 1.4 * k : 0.12 * k;
  out.armLeft = 0.25 * k;
  out.armRight = 1.35 * k;
  out.armLeftPitch = 0.55 * Math.sin(angle) * k;
  out.armRightPitch = -0.35 * k;
  out.elbowRight = 0.4 * k;
}

function applySpin(out: Pose, phase: number, angle: number, k: number) {
  out.bodyYaw = phase * Math.PI * 2 * k;
  out.armLeft = 2.45 * k;
  out.armRight = 2.45 * k;
  out.elbowLeft = 0.15 * k;
  out.elbowRight = 0.15 * k;
  out.torsoPitch = -0.06 * k;
  out.legs.left.knee = 0.28 * k;
  out.legs.right.knee = 0.28 * k;
  out.legs.left.thigh = -0.12 * k;
  out.legs.right.thigh = -0.12 * k;
  out.bodyY += 0.07 * Math.abs(Math.sin(angle)) * k;
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
