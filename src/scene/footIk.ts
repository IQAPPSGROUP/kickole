import { Quaternion, Vector3, type Object3D } from 'three';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mixer playback turns matrixAutoUpdate off, so a quaternion write must rebuild the matrix. */
function commit(joint: Object3D): void {
  joint.updateMatrix();
  joint.updateWorldMatrix(true, true);
}

/** Pull mixer-written quaternions into the matrices before reading a world position. */
function syncChain(node: Object3D): void {
  const chain: Object3D[] = [];
  let current: Object3D | null = node;
  while (current) {
    chain.push(current);
    current = current.parent;
  }
  for (let i = chain.length - 1; i >= 0; i--) chain[i].updateMatrix();
  node.updateWorldMatrix(true, true);
}

const bendHint = new Vector3();
const origin = new Vector3();
const fromDir = new Vector3();
const toDir = new Vector3();
const parentQ = new Quaternion();
const worldQ = new Quaternion();
const deltaQ = new Quaternion();
const limitedQ = new Quaternion();

const hipPos = new Vector3();
const kneePos = new Vector3();
const ankleTarget = new Vector3();
const solvedKnee = new Vector3();
const axis = new Vector3();
const plane = new Vector3();
const bend = new Vector3();
const restDir = new Vector3();
const localDir = new Vector3();
const endPos = new Vector3();
const worldPoint = new Vector3();

/**
 * Two-bone IK. `end` is the ankle (child of `shin`).
 * The knee is placed on the hip/ankle triangle so the leg can shorten — a
 * direction-only solver leaves a straight leg locked and the foot rides the hip.
 * An already bent clip knee stays the bend direction unless `forcePole` is set.
 * `poleWorld` is the fallback. Tricks that seat a foot force it so a raised clip knee cannot fold into the hip.
 * Returns the remaining distance from the ankle to the target, in metres.
 */
export function solveTwoBone(
  thigh: Object3D,
  shin: Object3D,
  end: Object3D,
  targetWorld: Vector3,
  poleWorld: Vector3,
  forcePole = false,
): number {
  const parent = thigh.parent;
  if (!parent) return 0;
  const thighLen = shin.position.length();
  const shinLen = end.position.length();
  if (thighLen < 1e-6 || shinLen < 1e-6) return 0;

  syncChain(end);
  thigh.getWorldPosition(hipPos);
  shin.getWorldPosition(kneePos);

  axis.copy(targetWorld).sub(hipPos);
  let reach = axis.length();
  const maxReach = thighLen + shinLen - 1e-4;
  const minReach = Math.abs(thighLen - shinLen) + 1e-4;
  if (reach < 1e-6) {
    axis.set(0, -1, 0);
    reach = minReach;
  } else {
    axis.multiplyScalar(1 / reach);
  }
  const clamped = clamp(reach, minReach, maxReach);
  ankleTarget.copy(hipPos).addScaledVector(axis, clamped);

  const along = (thighLen * thighLen + clamped * clamped - shinLen * shinLen) / (2 * clamped);
  const height = Math.sqrt(Math.max(0, thighLen * thighLen - along * along));

  // Keep the clip's knee plane when the leg is already bent. A straight plant
  // falls back to the pole so the knee breaks forward instead of locking.
  bend.copy(kneePos).sub(hipPos);
  plane.copy(bend).addScaledVector(axis, -bend.dot(axis));
  if (forcePole || plane.lengthSq() < 2.5e-3) {
    bend.copy(poleWorld).sub(hipPos);
    plane.copy(bend).addScaledVector(axis, -bend.dot(axis));
  }
  if (plane.lengthSq() < 1e-8) {
    plane.set(0, 0, 1).addScaledVector(axis, -axis.z);
    if (plane.lengthSq() < 1e-8) plane.set(1, 0, 0);
  }
  plane.normalize();
  solvedKnee.copy(hipPos).addScaledVector(axis, along).addScaledVector(plane, height);

  parent.getWorldQuaternion(parentQ);
  localDir.copy(solvedKnee).sub(hipPos).applyQuaternion(parentQ.invert());
  restDir.copy(shin.position).multiplyScalar(1 / thighLen);
  if (localDir.lengthSq() > 1e-10) {
    thigh.quaternion.setFromUnitVectors(restDir, localDir.normalize());
    commit(thigh);
  }

  thigh.getWorldQuaternion(worldQ);
  localDir.copy(ankleTarget).sub(solvedKnee).applyQuaternion(worldQ.invert());
  restDir.copy(end.position).multiplyScalar(1 / shinLen);
  if (localDir.lengthSq() > 1e-10) {
    shin.quaternion.setFromUnitVectors(restDir, localDir.normalize());
    commit(shin);
  }
  commit(end);
  return end.getWorldPosition(endPos).distanceTo(targetWorld);
}

/** Knee pole in front of the hip so the leg bends the way a planted footballer does. */
export function forwardPole(hipWorld: Vector3, out: Vector3): Vector3 {
  return out.copy(hipWorld).add(bendHint.set(0, -0.2, 0.55));
}

const pole = new Vector3();
const hipWorld = new Vector3();

/** Keep the ankle on `target` and level the sole. Returns the ankle error in metres. */
export function pinAnkle(
  thigh: Object3D,
  shin: Object3D,
  foot: Object3D,
  toe: Object3D | undefined,
  target: Vector3,
): number {
  thigh.getWorldPosition(hipWorld);
  const error = solveTwoBone(thigh, shin, foot, target, forwardPole(hipWorld, pole));
  plantSole(shin, foot, toe);
  return error;
}

const ankleWorld = new Vector3();
const toeWorld = new Vector3();
const soleDir = new Vector3();
const flatDir = new Vector3();
const toeRest = new Vector3();
const shinQ = new Quaternion();

/** Point the toe forward and slightly down so the sole stays on the ground. */
export function plantSole(shin: Object3D, foot: Object3D, toe: Object3D | undefined): void {
  shin.updateWorldMatrix(true, false);
  foot.getWorldPosition(ankleWorld);
  soleDir.set(0, -0.05, 0.15);
  if (toe) {
    toeRest.copy(toe.position);
    if (toeRest.lengthSq() > 1e-6) soleDir.copy(toeRest);
  }
  flatDir.copy(soleDir);
  flatDir.y = Math.min(flatDir.y, -Math.abs(flatDir.z) * 0.25);
  shin.getWorldQuaternion(shinQ);
  localDir.copy(flatDir.normalize()).applyQuaternion(shinQ.invert());
  toeRest.copy(toe?.position ?? soleDir);
  if (toeRest.lengthSq() < 1e-6) toeRest.set(0, -0.05, 0.15);
  foot.quaternion.setFromUnitVectors(toeRest.normalize(), localDir.normalize());
  commit(foot);
  if (toe) {
    toe.getWorldPosition(toeWorld);
    if (toeWorld.y < 0) {
      const lift = Math.min(0.4, (0 - toeWorld.y) * 4);
      foot.rotateX(lift);
      commit(foot);
    }
  }
}

/**
 * Rotate `bone` so `localOffset` moves toward `worldTarget`.
 * The turn is capped so a far ball cannot fold the joint.
 * Returns the uncapped angle in radians.
 */
export function aimPoint(bone: Object3D, localOffset: Vector3, worldTarget: Vector3, maxAngle: number): number {
  const parent = bone.parent;
  if (!parent) return 0;
  syncChain(bone);
  bone.getWorldPosition(origin);
  worldPoint.copy(localOffset).applyMatrix4(bone.matrixWorld);
  fromDir.copy(worldPoint).sub(origin);
  toDir.copy(worldTarget).sub(origin);
  if (fromDir.lengthSq() < 1e-8 || toDir.lengthSq() < 1e-8) return 0;
  fromDir.normalize();
  toDir.normalize();
  deltaQ.setFromUnitVectors(fromDir, toDir);
  const angle = 2 * Math.acos(clamp(deltaQ.w, -1, 1));
  if (!Number.isFinite(angle) || angle < 1e-4) return 0;
  limitedQ.identity();
  if (angle > maxAngle) limitedQ.slerp(deltaQ, maxAngle / angle);
  else limitedQ.copy(deltaQ);
  parent.getWorldQuaternion(parentQ);
  bone.getWorldQuaternion(worldQ);
  worldQ.premultiply(limitedQ);
  bone.quaternion.copy(parentQ.invert()).multiply(worldQ);
  commit(bone);
  return angle;
}

/** Horizontal travel and vertical bob of a foot path, in metres. */
export function footTravel(samples: ReadonlyArray<{ x: number; y: number; z: number }>): { slide: number; bob: number } {
  if (samples.length === 0) return { slide: 0, bob: 0 };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return { slide: Math.hypot(maxX - minX, maxZ - minZ), bob: maxY - minY };
}

