import { AnimationMixer, Matrix4, Vector3, type AnimationClip, type Bone, type Mesh, type Object3D, type SkinnedMesh } from 'three';
import { DEFAULT_CONFIG } from '../engine/config';
import { ballOnBoot, type BallCenter } from '../engine/footContact';
import type { Side } from '../engine/config';
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

const LEG_MATERIALS = new Set(['Boots', 'Boots_Sole', 'Socks', 'Boot_Laces', 'Boot_Trim']);

/** Closest skinned vertex on the named materials. That is the surface the ball would hit first. */
function closestSkinnedVertex(scene: Object3D, target: Vector3, materials: Set<string>): Vector3 | null {
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
      const distance = skinnedWorld.distanceTo(target);
      if (distance < best) {
        best = distance;
        bestPoint = skinnedWorld.clone();
      }
    }
  });
  return bestPoint;
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

/**
 * Pose one kick clip on its contact frame and return the ball centre that meets the boot.
 * Leaves the scene on that pose so a caller can measure the gap. Null when the clip or the boot is missing.
 */
export function ballCenterForKick(scene: Object3D, clips: AnimationClip[], side: Side): KickAnchor | null {
  const mixer = poseClip(scene, clips, clipName(side), KICK_CLIP_CONTACT_TIME);
  const foot = boneNamed(scene, footBoneName(side));
  if (!mixer || !foot) {
    releaseMixer(mixer, scene);
    return null;
  }
  const sign = side === 'left' ? -1 : 1;
  const approach = new Vector3(
    sign * DEFAULT_CONFIG.footX * 0.6,
    DEFAULT_CONFIG.contactHeight,
    DEFAULT_CONFIG.ballZ,
  );
  const first = closestSkinnedVertex(scene, approach, LEG_MATERIALS);
  const footPosition = foot.getWorldPosition(new Vector3());
  // Hold the mixer so the contact pose stays posed while the caller measures the boot gap.
  scene.userData.kickContactMixer = mixer;
  // No boot mesh: sit the ball one radius in front of the foot bone, toward the authored target.
  const boot = first ?? new Vector3(footPosition.x, footPosition.y, footPosition.z).lerp(approach, 0.35);
  const radius = DEFAULT_CONFIG.ballRadius;
  const center = new Vector3();
  const placed = ballOnBoot(
    { x: boot.x, y: boot.y, z: boot.z },
    { x: approach.x, y: approach.y, z: approach.z },
    radius,
  );
  center.set(placed.x, placed.y, placed.z);
  // The first hit can be the toe while the sole still cuts the bottom of the ball. Push out until every boot vertex is outside.
  let strike = boot;
  for (let pass = 0; pass < 6; pass++) {
    const hit = closestSkinnedVertex(scene, center, LEG_MATERIALS);
    if (!hit) break;
    const distance = hit.distanceTo(center);
    if (distance >= radius - 0.0005) {
      strike = hit;
      break;
    }
    const away = center.clone().sub(hit);
    if (away.lengthSq() < 1e-10) break;
    away.multiplyScalar((radius + 0.001 - distance) / away.length());
    center.add(away);
    strike = hit;
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
