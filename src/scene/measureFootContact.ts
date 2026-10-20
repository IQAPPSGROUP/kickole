import { AnimationMixer, Matrix4, Quaternion, Vector3, type AnimationClip, type Bone, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import { DEFAULT_CONFIG } from '../engine/config';
import { ballOnBoot, type BallCenter } from '../engine/footContact';
import type { Side } from '../engine/config';
import { kickToeClearance, toeClearanceQuaternion } from './kickClearance';
import { KICK_CLIP_CONTACT_TIME } from './rig';

export interface KickAnchor {
  /** Ball centre that puts the leather on the boot. */
  center: BallCenter;
  /** Boot vertex the ball surface touches. */
  strike: BallCenter;
}

const bindPosition = new Vector3();
const weighted = new Vector3();
const skinnedWorld = new Vector3();
const boneWorld = new Matrix4();

function boneNamed(scene: Object3D, name: string): Bone | null {
  let found: Bone | null = null;
  scene.traverse((obj) => {
    if (found) return;
    const bone = obj as Bone;
    if (bone.isBone && bone.name === name) found = bone;
  });
  return found;
}

function materialNames(material: { name: string } | Array<{ name: string }>): string[] {
  const list = Array.isArray(material) ? material : [material];
  return list.map((entry) => entry.name);
}

// Leather only. A sock vertex inside the ankle can satisfy a distance check while the boot still sits clear of the ball.
const LEG_MATERIALS = new Set(['Boots', 'Boots_Sole', 'Boot_Laces', 'Boot_Trim']);

/** Boot, shirt and skin sets used by contact tests and the freestyle seat. */
export const BOOT_MATERIALS = LEG_MATERIALS;
export const BODY_MATERIALS = new Set(['Skin', 'Shirt', 'Shorts']);
export const UPPER_MATERIALS = new Set(['Skin', 'Shirt']);
export const THIGH_MATERIALS = new Set(['Skin', 'Shorts']);

/**
 * Closest skinned vertex on the named materials.
 * `near` / `nearRadius` keep the search on one body part (the instep, not the other boot).
 */
export function closestSkinnedVertex(
  scene: Object3D,
  target: Vector3,
  materials: Set<string>,
  near?: Vector3,
  nearRadius = Infinity,
): Vector3 | null {
  let best = Number.POSITIVE_INFINITY;
  let bestPoint: Vector3 | null = null;
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isMesh || !mesh.geometry?.attributes.position) return;
    const names = materialNames(mesh.material as { name: string } | Array<{ name: string }>);
    if (!names.some((name) => materials.has(name)) || !mesh.geometry?.attributes.position) return;
    if (!mesh.isSkinnedMesh || !mesh.geometry.attributes.skinIndex) {
      const plain = mesh as Mesh;
      const position = plain.geometry.attributes.position;
      for (let i = 0; i < position.count; i++) {
        skinnedWorld.fromBufferAttribute(position, i).applyMatrix4(plain.matrixWorld);
        if (near && skinnedWorld.distanceTo(near) > nearRadius) continue;
        const distance = skinnedWorld.distanceTo(target);
        if (distance < best) {
          best = distance;
          bestPoint = skinnedWorld.clone();
        }
      }
      return;
    }
    mesh.skeleton.update();
    const position = mesh.geometry.attributes.position;
    const skinIndex = mesh.geometry.attributes.skinIndex;
    const skinWeight = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < position.count; i++) {
      bindPosition.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
      skinnedWorld.set(0, 0, 0);
      for (let influence = 0; influence < 4; influence++) {
        const weight = skinWeight.getComponent(i, influence);
        if (weight === 0) continue;
        const boneIndex = skinIndex.getComponent(i, influence);
        const bone = mesh.skeleton.bones[boneIndex];
        if (!bone) continue;
        boneWorld.multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[boneIndex]);
        skinnedWorld.addScaledVector(weighted.copy(bindPosition).applyMatrix4(boneWorld), weight);
      }
      if (near && skinnedWorld.distanceTo(near) > nearRadius) continue;
      const distance = skinnedWorld.distanceTo(target);
      if (distance < best) {
        best = distance;
        bestPoint = skinnedWorld.clone();
      }
    }
  });
  return bestPoint;
}

/** Contract rigs pitch the foot at the contact frame. Quaternius clips do not. Measure the pose that is actually drawn. */
function usesContactToeLift(scene: Object3D): boolean {
  let clavicle = false;
  scene.traverse((obj) => {
    if (clavicle) return;
    if ((obj as Bone).isBone && obj.name === 'Clavicle_L') clavicle = true;
  });
  return !clavicle;
}

function applyContactToeLift(scene: Object3D, side: Side) {
  if (!usesContactToeLift(scene)) return;
  const foot = boneNamed(scene, footBoneName(side));
  const pitch = kickToeClearance(KICK_CLIP_CONTACT_TIME);
  if (!foot || pitch === 0) return;
  foot.quaternion.multiply(toeClearanceQuaternion(pitch, new Quaternion()));
  scene.updateMatrixWorld(true);
}

function poseClip(scene: Object3D, clips: AnimationClip[], name: string, time: number): AnimationMixer | null {
  const clip = clips.find((entry) => entry.name === name);
  if (!clip) return null;
  const mixer = new AnimationMixer(scene);
  const action = mixer.clipAction(clip);
  action.play();
  action.paused = true;
  // The first update binds the clip; the second applies `time`. A single update(0) leaves the bind pose.
  action.time = 0;
  mixer.update(0);
  action.time = time;
  mixer.update(0);
  scene.updateMatrixWorld(true);
  return mixer;
}

function releaseMixer(mixer: AnimationMixer | null, scene: Object3D): void {
  if (!mixer) return;
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
}

function clipName(side: Side): 'KickLeft' | 'KickRight' {
  switch (side) {
    case 'left': return 'KickLeft';
    case 'right': return 'KickRight';
    default: {
      const neverSide: never = side;
      return neverSide;
    }
  }
}

function footBoneName(side: Side): 'Foot_L' | 'Foot_R' {
  switch (side) {
    case 'left': return 'Foot_L';
    case 'right': return 'Foot_R';
    default: {
      const neverSide: never = side;
      return neverSide;
    }
  }
}

function toeBoneName(side: Side): 'Toe_L' | 'Toe_R' {
  switch (side) {
    case 'left': return 'Toe_L';
    case 'right': return 'Toe_R';
    default: {
      const neverSide: never = side;
      return neverSide;
    }
  }
}

/** Boot vertex on the laces, and the direction from the foot bones out through that vertex. */
function instepStrike(scene: Object3D, foot: Vector3, toe: Vector3): { point: Vector3; outward: Vector3 } | null {
  const axis = toe.clone().sub(foot);
  const length = axis.length();
  if (length < 1e-4) return null;
  axis.multiplyScalar(1 / length);
  const up = new Vector3(0, 1, 0);
  const instep = up.clone().sub(axis.clone().multiplyScalar(up.dot(axis)));
  if (instep.lengthSq() < 1e-8) instep.copy(up);
  instep.normalize();
  // Front of the instep, just short of the toe, on the upper side of the boot.
  const probe = foot.clone().addScaledVector(axis, length * 0.78).addScaledVector(instep, 0.045);
  const point = closestSkinnedVertex(scene, probe, LEG_MATERIALS);
  if (!point) return null;
  const along = Math.max(0, Math.min(length, point.clone().sub(foot).dot(axis)));
  const bone = foot.clone().addScaledVector(axis, along);
  const outward = point.clone().sub(bone);
  if (outward.lengthSq() < 1e-8 || outward.dot(instep) < 0) outward.copy(instep);
  outward.normalize();
  return { point, outward };
}

/**
 * Ball centre on the laces of whatever pose is already on `scene`.
 * The leather meets the bottom of the ball, a couple of centimetres into the kiss.
 */
export function ballCenterOnInstep(scene: Object3D, side: Side, radius: number): Vector3 | null {
  const foot = boneNamed(scene, footBoneName(side));
  if (!foot) return null;
  const toe = boneNamed(scene, toeBoneName(side));
  const footPosition = foot.getWorldPosition(new Vector3());
  const toePosition = toe ? toe.getWorldPosition(new Vector3()) : footPosition.clone().add(new Vector3(0, -0.04, 0.16));
  const seated = instepStrike(scene, footPosition, toePosition);
  if (!seated) return null;
  return seated.point.clone().addScaledVector(seated.outward, Math.max(0.02, radius - 0.012));
}

/** Signed gap: closest surface vertex to the ball centre, minus the radius. Negative means the mesh is inside the ball. */
export function surfaceGap(
  scene: Object3D,
  center: Vector3,
  radius: number,
  materials: Set<string>,
  near?: Vector3,
  nearRadius = Infinity,
): number {
  const hit = closestSkinnedVertex(scene, center, materials, near, nearRadius);
  if (!hit) return Number.POSITIVE_INFINITY;
  return hit.distanceTo(center) - radius;
}

/** Instep vertex in the foot bone's local space, for the pose currently on `scene`. */
export function instepLocalPoint(scene: Object3D, foot: Object3D, toe: Object3D | undefined): Vector3 | null {
  const footPosition = foot.getWorldPosition(new Vector3());
  const toePosition = toe ? toe.getWorldPosition(new Vector3()) : footPosition.clone().add(new Vector3(0, -0.04, 0.16));
  const seated = instepStrike(scene, footPosition, toePosition);
  if (!seated) return null;
  return foot.worldToLocal(seated.point.clone());
}

/**
 * Pose one kick clip on its contact frame and return the ball centre that meets the boot.
 * Leaves the scene on that pose so a caller can measure the gap. Null when the clip or the boot is missing.
 */
export function ballCenterForKick(scene: Object3D, clips: AnimationClip[], side: Side): KickAnchor | null {
  const mixer = poseClip(scene, clips, clipName(side), KICK_CLIP_CONTACT_TIME);
  applyContactToeLift(scene, side);
  const foot = boneNamed(scene, footBoneName(side));
  if (!mixer || !foot) {
    releaseMixer(mixer, scene);
    return null;
  }
  const footPosition = foot.getWorldPosition(new Vector3());
  const toe = boneNamed(scene, toeBoneName(side));
  const toePosition = toe ? toe.getWorldPosition(new Vector3()) : footPosition.clone().add(new Vector3(0, -0.04, 0.16));
  // Hold the mixer so the contact pose stays posed while the caller measures the boot gap.
  scene.userData.kickContactMixer = mixer;
  const radius = DEFAULT_CONFIG.ballRadius;
  const seated = instepStrike(scene, footPosition, toePosition);
  const center = new Vector3();
  let strike: Vector3;
  if (seated) {
    strike = seated.point;
    center.copy(strike).addScaledVector(seated.outward, radius);
    // Stay on the sphere around the instep vertex so that point keeps touching,
    // and slide until the rest of the boot is outside the leather.
    for (let pass = 0; pass < 6; pass++) {
      const hit = closestSkinnedVertex(scene, center, LEG_MATERIALS);
      if (!hit) break;
      const distance = hit.distanceTo(center);
      if (distance >= radius - 0.0005) break;
      const away = center.clone().sub(hit);
      if (away.lengthSq() < 1e-10) break;
      away.normalize();
      center.addScaledVector(away, radius + 0.001 - distance);
      const radial = center.clone().sub(strike);
      if (radial.lengthSq() < 1e-10) radial.copy(seated.outward);
      radial.setLength(radius);
      center.copy(strike).add(radial);
    }
    // A simplified boot can still nick the leather. Step out, then pull back onto the nearest vertex.
    // Seat the ball into the leather. A surface kiss still leaves a dark pixel of
    // background between the boot and the ball in the gameplay camera.
    const kiss = 0.028;
    let touching: Vector3 | null = null;
    for (let pass = 0; pass < 8; pass++) {
      const hit = closestSkinnedVertex(scene, center, LEG_MATERIALS);
      if (!hit) break;
      const distance = hit.distanceTo(center);
      const away = center.clone().sub(hit);
      if (away.lengthSq() < 1e-10) break;
      away.normalize();
      const seated = radius - kiss;
      if (distance < seated - 0.001) {
        center.copy(hit).addScaledVector(away, seated + 0.001);
        touching = hit;
        continue;
      }
      if (distance > seated + 0.002) {
        center.copy(hit).addScaledVector(away, seated);
        touching = hit;
        continue;
      }
      touching = hit;
      break;
    }
    if (touching) strike = touching;
  } else {
    const sign = side === 'left' ? -1 : 1;
    const approach = new Vector3(sign * DEFAULT_CONFIG.footX * 0.6, DEFAULT_CONFIG.contactHeight, DEFAULT_CONFIG.ballZ);
    const placed = ballOnBoot(
      { x: footPosition.x, y: footPosition.y, z: footPosition.z },
      { x: approach.x, y: approach.y, z: approach.z },
      radius,
    );
    center.set(placed.x, placed.y, placed.z);
    strike = footPosition;
  }
  return {
    center: { x: center.x, y: center.y, z: center.z },
    strike: { x: strike.x, y: strike.y, z: strike.z },
  };
}

/** Measure both kick clips, then put the scene back on Idle so the first painted frame is not a kick. */
export function measureKickContactAnchors(scene: Object3D, clips: AnimationClip[]): Record<Side, BallCenter | null> {
  const left = ballCenterForKick(scene, clips, 'left');
  const right = ballCenterForKick(scene, clips, 'right');
  releaseMixer(poseClip(scene, clips, 'Idle', 0), scene);
  return { left: left?.center ?? null, right: right?.center ?? null };
}
