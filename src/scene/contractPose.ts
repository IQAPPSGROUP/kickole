import type { Bone } from 'three';
import type { Pose } from './pose';
import type { BoneKey } from './rig';

/**
 * Map a procedural pose onto the Fab contract bones. Euler order is the bind convention.
 * Arms rest in a T, so a 90° twist around local Z hangs them before the outward angle.
 */
const ARM_HANG = Math.PI / 2;

export function applyContractBones(bones: Partial<Record<BoneKey, Bone>>, pose: Pose, hipsRestY: number) {
  const set = (key: BoneKey, x: number, y: number, z: number) => {
    const bone = bones[key];
    if (bone) bone.rotation.set(x, y, z);
  };
  if (bones.root) bones.root.position.y = hipsRestY + pose.bodyY;
  set('root', 0, pose.bodyYaw, 0);
  set('spine', pose.torsoPitch, pose.torsoYaw, pose.torsoRoll);
  set('neck', pose.neckPitch, pose.neckYaw, 0);
  set('head', pose.headPitch, pose.headYaw, 0);
  set('armLeft', -pose.armLeftPitch, 0, ARM_HANG - pose.armLeft);
  set('armRight', -pose.armRightPitch, 0, -ARM_HANG + pose.armRight);
  set('elbowLeft', pose.elbowLeft, 0, 0);
  set('elbowRight', pose.elbowRight, 0, 0);
  const leg = (side: 'left' | 'right', thigh: BoneKey, shin: BoneKey, foot: BoneKey) => {
    const limb = pose.legs[side];
    set(thigh, limb.thigh, limb.twist, limb.abduct);
    set(shin, limb.knee, 0, 0);
    set(foot, limb.foot, limb.ankleYaw, limb.ankleRoll);
  };
  leg('left', 'thighLeft', 'shinLeft', 'footLeft');
  leg('right', 'thighRight', 'shinRight', 'footRight');
}
