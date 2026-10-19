import { Euler, type Quaternion } from 'three';
import type { Pose } from './pose';
import type { PlayerMotion } from './motion';
import type { BoneKey } from './rig';
import { ueLocalRotation } from './ue-pose';

const euler = new Euler();

/** Convert semantic accents into the v2 rig's axes, retaining its T-pose arm-hang correction. */
export function ueMovementQuaternion(key: BoneKey, pose: Pose, motion: PlayerMotion, out: Quaternion): Quaternion {
  const r = ueLocalRotation(key, pose);
  const live = !['relaxed-sway', 'ready-bounce', 'miss-recovery'].includes(motion.name);
  const reaction = ['fist-pump', 'shoulder-shimmy', 'salute'].includes(motion.name);
  switch (key) {
    case 'root': r.y += motion.rootYaw; break;
    case 'spine': r.x += motion.spineX; r.y += motion.spineY; r.z += motion.spineZ; break;
    case 'head':
      // UE procedural pose already follows the ball. Add idle/reaction turns without doubling that tracking.
      if (motion.name === 'relaxed-sway' || motion.name === 'ready-bounce' || motion.name === 'miss-recovery') r.y += motion.headY;
      r.z += motion.headZ; break;
    case 'armLeft':
    case 'armRight': {
      const left = key === 'armLeft';
      if (live) {
        // V2 has no celebration clips: supply the full pose instead of accents that assume raised arms.
        const target = motion.name === 'fist-pump' ? (left ? .45 : 2.55)
          : motion.name === 'shoulder-shimmy' ? 1.05 : motion.name === 'salute' ? 2.6 : .22;
        const angle = .22 + (target - .22) * motion.reactionWeight;
        r.z = left ? Math.PI / 2 - angle : -Math.PI / 2 + angle;
      }
      r.x -= left ? motion.leftX : motion.rightX;
      r.y += left ? motion.leftY : motion.rightY;
      if (!reaction) r.z -= left ? motion.leftZ : motion.rightZ;
      break;
    }
    case 'footLeft': r.x += motion.leftFoot; break;
    case 'footRight': r.x += motion.rightFoot; break;
  }
  return out.setFromEuler(euler.set(r.x, r.y, r.z, 'XYZ'));
}
