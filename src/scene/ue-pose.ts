import { Euler, Quaternion } from 'three';
import type { Pose } from './pose';
import type { BoneKey } from './rig';

/**
 * Local rotation applied on top of the Quaternius rest pose.
 *
 * Bone-local +Y points along the limb. Arms rest in a T-pose, so they hang
 * from a ±90° twist around local Z before the procedural outward angle is added.
 * Thigh, knee and spine signs were checked against this skeleton's world axes:
 * local +X swings the limb toward world +Z (forward) when the angle is negative
 * for the thigh and positive for the knee and spine.
 */
export function ueLocalRotation(key: BoneKey, pose: Pose): { x: number; y: number; z: number } {
  const hang = Math.PI / 2;
  switch (key) {
    case 'root':
      return { x: 0, y: pose.bodyYaw, z: 0 };
    case 'spine':
      return { x: pose.torsoPitch, y: 0, z: pose.torsoRoll };
    case 'head':
      return { x: pose.headPitch, y: pose.headYaw, z: 0 };
    case 'armLeft':
      return { x: -pose.armLeftPitch, y: 0, z: hang - pose.armLeft };
    case 'armRight':
      return { x: -pose.armRightPitch, y: 0, z: -hang + pose.armRight };
    case 'thighLeft':
      return { x: pose.legs.left.thigh, y: 0, z: pose.legs.left.abduct };
    case 'thighRight':
      return { x: pose.legs.right.thigh, y: 0, z: pose.legs.right.abduct };
    case 'shinLeft':
      return { x: pose.legs.left.knee, y: 0, z: 0 };
    case 'shinRight':
      return { x: pose.legs.right.knee, y: 0, z: 0 };
    case 'footLeft':
      return { x: pose.legs.left.foot, y: 0, z: 0 };
    case 'footRight':
      return { x: pose.legs.right.foot, y: 0, z: 0 };
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}

const euler = new Euler();

/** Delta multiplied on the right of the bone's rest quaternion. */
export function ueDeltaQuaternion(key: BoneKey, pose: Pose, out: Quaternion): Quaternion {
  const r = ueLocalRotation(key, pose);
  euler.set(r.x, r.y, r.z, 'XYZ');
  return out.setFromEuler(euler);
}
