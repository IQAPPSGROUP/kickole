// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Box3, Matrix4, Quaternion, Vector3, type AnimationClip, type Bone, type Group, type Material, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DEFAULT_CONFIG } from '../engine/config';
import { GameEngine } from '../engine/engine';
import { computePose } from './pose';
import { ueDeltaQuaternion } from './ue-pose';
import { ANIMATION_STATES, BONE_NAMES, KICK_CLIP_CONTACT_TIME, MATERIAL_NAMES, validateModel, type BoneKey } from './rig';

const MODEL = new URL('../../public/models/kickole_player_v3.glb', import.meta.url);

async function load() {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(MODEL);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group; animations: AnimationClip[] }>((res, rej) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(ab, '', (g) => res(g as never), rej);
  });
}

function materialNames(material: Material | Material[]): string[] {
  const list = Array.isArray(material) ? material : [material];
  return list.map((entry) => entry.name);
}

const bindPosition = new Vector3();
const weighted = new Vector3();
const skinnedWorld = new Vector3();
const boneWorld = new Matrix4();

/** Closest boot vertex to the ball, as a gap outside the surface. Negative means the mesh is inside. */
function bootSurfaceGap(scene: Group, ball: Vector3): number {
  let gap = Number.POSITIVE_INFINITY;
  let samples = 0;
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.geometry?.attributes.position || !mesh.geometry.attributes.skinIndex) return;
    if (!materialNames(mesh.material).some((name) => name === 'Boots' || name === 'Boots_Sole')) return;
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
        if (!bone) throw new Error(`missing bone ${boneIndex} on ${mesh.name} (${mesh.skeleton.bones.length} bones)`);
        boneWorld.multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[boneIndex]);
        skinnedWorld.addScaledVector(weighted.copy(bindPosition).applyMatrix4(boneWorld), weight);
      }
      samples += 1;
      gap = Math.min(gap, skinnedWorld.distanceTo(ball) - DEFAULT_CONFIG.ballRadius);
    }
  });
  if (samples === 0) throw new Error('no boot vertices');
  return gap;
}

function bonesOf(scene: Group) {
  const bones: Record<string, Bone> = {};
  const names: string[] = [];
  scene.traverse((o) => {
    if ((o as Bone).isBone) {
      names.push(o.name);
      bones[o.name] = o as Bone;
    }
  });
  return { bones, names };
}

describe('kickole_player_v3.glb', () => {
  it('meets the rig contract: renamed bones, eight materials, five clips, mobile budgets', async () => {
    const gltf = await load();
    const { names } = bonesOf(gltf.scene);
    const mats = new Set<string>();
    let tris = 0;
    gltf.scene.traverse((o) => {
      const mesh = o as { isMesh?: boolean; material?: { name: string } | Array<{ name: string }>; geometry?: { index?: { count: number } | null; attributes: { position?: { count: number } } } };
      if (!mesh.isMesh || !mesh.geometry) return;
      const list = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of list) mats.add(m.name);
      const geo = mesh.geometry;
      tris += (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
    });
    expect(gltf.animations.map((a) => a.name).sort()).toEqual([...ANIMATION_STATES].sort());
    expect(validateModel(names, gltf.animations.map((a) => a.name), mats)).toEqual({ missingBones: [], missingClips: [], missingMaterials: [] });
    expect(Object.values(BONE_NAMES).every((n) => names.includes(n))).toBe(true);
    expect([...mats].sort()).toEqual([...Object.values(MATERIAL_NAMES)].sort());
    expect(names.length).toBeLessThanOrEqual(40);
    expect(tris).toBeLessThan(15_000);
    expect(readFileSync(MODEL).length).toBeLessThan(1_500_000);
  });

  it('stands about 1.8 m tall with feet on the floor', async () => {
    const gltf = await load();
    const box = new Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(1.6);
    expect(height).toBeLessThan(1.9);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
  });

  it('lowers the arms in Idle so the pose is narrower than the T-pose bind', async () => {
    const gltf = await load();
    const { bones } = bonesOf(gltf.scene);
    const mixer = new AnimationMixer(gltf.scene);
    const idle = mixer.clipAction(gltf.animations.find((c) => c.name === 'Idle')!);
    idle.play();
    idle.paused = true;
    idle.time = 0.4;
    mixer.update(0);
    gltf.scene.updateMatrixWorld(true);
    const left = bones.Hand_L.getWorldPosition(new Vector3());
    const right = bones.Hand_R.getWorldPosition(new Vector3());
    expect(left.x).toBeLessThan(-0.15);
    expect(right.x).toBeGreaterThan(0.15);
    expect(Math.abs(left.x)).toBeLessThan(0.6);
    expect(Math.abs(right.x)).toBeLessThan(0.6);
    expect(left.y).toBeLessThan(1.35);
    expect(right.y).toBeLessThan(1.35);
  });

  it.each([['KickLeft', 'Foot_L', 'Toe_L', -1], ['KickRight', 'Foot_R', 'Toe_R', 1]] as const)(
    '%s swings the foot toward +Z and the toe meets the ball at 0.30 s',
    async (clip, footName, toeName, sx) => {
      const gltf = await load();
      const { bones } = bonesOf(gltf.scene);
      const mixer = new AnimationMixer(gltf.scene);
      const action = mixer.clipAction(gltf.animations.find((c) => c.name === clip)!);
      action.play();
      action.paused = true;
      action.time = 0;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const restZ = bones[footName].getWorldPosition(new Vector3()).z;
      action.time = KICK_CLIP_CONTACT_TIME;
      mixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      const foot = bones[footName].getWorldPosition(new Vector3());
      const toe = bones[toeName].getWorldPosition(new Vector3());
      const c = DEFAULT_CONFIG;
      const ball = new Vector3(sx * c.footX * 0.6, c.contactHeight, c.ballZ);
      const gap = toe.distanceTo(ball) - c.ballRadius;
      expect(foot.z - restZ).toBeGreaterThan(0.25);
      expect(gap).toBeLessThan(0.14);
      expect(gap).toBeGreaterThan(0.06);
      expect(toe.z).toBeLessThan(ball.z + 0.02);
      expect(toe.y).toBeGreaterThan(ball.y - 0.1);
      const meshGap = bootSurfaceGap(gltf.scene, ball);
      expect(meshGap).toBeGreaterThan(-0.015);
      expect(meshGap).toBeLessThan(0.06);
    },
  );

  it('lifts the kicking leg so the instep meets the ball', async () => {
    const gltf = await load();
    const { bones } = bonesOf(gltf.scene);
    const e = new GameEngine();
    e.prepare('ready');
    e.phase = 'playing';
    e.time = 1;
    e.lastKick.left = 1 - e.config.contactDelay;
    e.ball.x = -e.config.footX * 0.6;
    e.ball.y = e.config.contactHeight;
    e.ball.z = e.config.ballZ;
    e.ball.vy = 0;
    e.contact = {
      kind: 'pending', side: 'left', grade: 'perfect', deltaMs: 0,
      held: e.config.contactDelay, highFlick: false, kickPower: 0, thigh: false,
    };
    const pose = computePose(e);
    const delta = new Quaternion();
    const keys: BoneKey[] = ['thighLeft', 'shinLeft', 'footLeft'];
    for (const key of keys) {
      const bone = bones[BONE_NAMES[key]];
      bone.quaternion.multiply(ueDeltaQuaternion(key, pose, delta));
    }
    gltf.scene.updateMatrixWorld(true);
    const foot = bones.Foot_L.getWorldPosition(new Vector3());
    const ball = new Vector3(e.ball.x, e.ball.y, e.ball.z);
    expect(foot.y).toBeGreaterThan(0.45);
    expect(foot.distanceTo(ball)).toBeLessThan(0.28);
    expect(bootSurfaceGap(gltf.scene, ball)).toBeLessThan(0.08);
  });

  it('skins the authored hair to the head bone', async () => {
    const gltf = await load();
    let total = 0;
    let onHead = 0;
    gltf.scene.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (!mesh.isSkinnedMesh) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (!list.some((m) => m.name === 'Hair')) return;
      const index = mesh.geometry.getAttribute('skinIndex');
      const weight = mesh.geometry.getAttribute('skinWeight');
      const head = mesh.skeleton.bones.findIndex((b) => b.name === 'Head');
      expect(head).toBeGreaterThanOrEqual(0);
      for (let i = 0; i < index.count; i++) {
        let best = 0;
        let bestW = -1;
        for (let k = 0; k < 4; k++) {
          const w = weight.getComponent(i, k);
          if (w > bestW) {
            bestW = w;
            best = index.getComponent(i, k);
          }
        }
        total += 1;
        if (best === head && bestW > 0.5) onHead += 1;
      }
    });
    expect(total).toBeGreaterThan(0);
    expect(onHead / total).toBeGreaterThan(0.9);
  });
});
