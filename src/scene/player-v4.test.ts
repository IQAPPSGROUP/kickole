// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Box3, Matrix4, Texture, Vector3, type AnimationClip, type Bone, type Group, type Material, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DEFAULT_CONFIG } from '../engine/config';
import { ballCenterForKick } from './measureFootContact';
import { ANIMATION_STATES, BONE_NAMES, KICK_CLIP_CONTACT_TIME, MATERIAL_NAMES, validateModel } from './rig';

const LOD0 = new URL('../../public/models/kickole_player_v4.glb', import.meta.url);
const LOD1 = new URL('../../public/models/kickole_player_v4_lod1.glb', import.meta.url);
const FEMALE0 = new URL('../../public/models/kickole_player_v4_female.glb', import.meta.url);
const FEMALE1 = new URL('../../public/models/kickole_player_v4_female_lod1.glb', import.meta.url);

function glbJson(file: URL) {
  const bytes = readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    extensionsRequired?: string[];
    images?: { mimeType?: string }[];
  };
}

async function load(file: URL) {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group; animations: AnimationClip[] }>((res, rej) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({
      name: 'KHR_texture_basisu',
      loadTexture: () => Promise.resolve(new Texture()),
    }));
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
        if (!bone) throw new Error(`missing bone ${boneIndex}`);
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

function triangles(scene: Group): number {
  let tris = 0;
  scene.traverse((o) => {
    const mesh = o as { isMesh?: boolean; geometry?: { index?: { count: number } | null; attributes: { position?: { count: number } } } };
    if (!mesh.isMesh || !mesh.geometry) return;
    const geo = mesh.geometry;
    tris += (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3;
  });
  return tris;
}

describe.each([
  ['kickole_player_v4.glb', LOD0, 18_000, 50_000],
  ['kickole_player_v4_lod1.glb', LOD1, 12_000, 15_000],
  ['kickole_player_v4_female.glb', FEMALE0, 18_000, 50_000],
  ['kickole_player_v4_female_lod1.glb', FEMALE1, 12_000, 15_000],
] as const)('%s', (label, file, minTris, maxTris) => {
  const allowed = new Set<string>([...Object.values(MATERIAL_NAMES), 'Eyes', 'InnerMouth']);
  it('is meshopt + KTX2 and stays inside the triangle budget', async () => {
    const json = glbJson(file);
    expect(json.extensionsRequired).toEqual(expect.arrayContaining(['KHR_texture_basisu', 'EXT_meshopt_compression']));
    const images = json.images ?? [];
    expect(images.every((image) => image.mimeType === 'image/ktx2' || image.mimeType === 'image/png')).toBe(true);
    // The male face is the Fab photograph as PNG. The compressed copy of that image
    // sampled as one flat colour and a black hole on the skinned head.
    const pngs = images.filter((image) => image.mimeType === 'image/png').length;
    expect(pngs).toBe(label.includes('female') ? 0 : 2);
    const gltf = await load(file);
    const { names } = bonesOf(gltf.scene);
    const mats = new Set<string>();
    gltf.scene.traverse((o) => {
      const mesh = o as { isMesh?: boolean; material?: { name: string } | Array<{ name: string }> };
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) mats.add(m.name);
    });
    expect(gltf.animations.map((a) => a.name).sort()).toEqual([...ANIMATION_STATES].sort());
    expect(validateModel(names, gltf.animations.map((a) => a.name), mats)).toEqual({ missingBones: [], missingClips: [], missingMaterials: [] });
    expect(Object.values(BONE_NAMES).every((n) => names.includes(n))).toBe(true);
    expect(mats.has('Eyes')).toBe(true);
    for (const name of mats) expect(allowed.has(name)).toBe(true);
    const male = !label.includes('female');
    let headPhoto = 0;
    gltf.scene.traverse((o) => {
      const mesh = o as { isMesh?: boolean; material?: Material | Material[] };
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of list) {
        if (material.name === 'Skin' && material.userData.headPhoto === true) headPhoto += 1;
      }
    });
    expect(headPhoto).toBe(male ? 1 : 0);
    expect(names.length).toBeLessThanOrEqual(40);
    const tris = triangles(gltf.scene);
    expect(tris).toBeGreaterThanOrEqual(minTris);
    expect(tris).toBeLessThanOrEqual(maxTris);
    expect(readFileSync(file).length).toBeLessThan(8_000_000);
    expect(label.length).toBeGreaterThan(0);
  });

  it('stands about 1.8 m tall with feet on the floor', async () => {
    const gltf = await load(file);
    const box = new Box3().setFromObject(gltf.scene);
    const height = box.max.y - box.min.y;
    expect(height).toBeGreaterThan(1.6);
    expect(height).toBeLessThan(1.9);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
  });

  it('lowers the arms in Idle', async () => {
    const gltf = await load(file);
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
    '%s meets the ball at 0.30 s without the toe sinking in',
    async (clip, footName, toeName, sx) => {
      const gltf = await load(file);
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
      // The readable ball is 0.11 across, so this fixed authored centre sits a little further off the leather than the 0.14 ball did.
      expect(meshGap).toBeLessThan(0.09);
    },
  );

  it.each([['left'], ['right']] as const)('puts the ball on the %s boot at the contact frame', async (side) => {
    const gltf = await load(file);
    const anchor = ballCenterForKick(gltf.scene, gltf.animations, side);
    expect(anchor).not.toBeNull();
    const center = anchor!.center;
    const strike = anchor!.strike;
    const touch = Math.hypot(center.x - strike.x, center.y - strike.y, center.z - strike.z);
    // The centre stays on the instep, seated into the leather so the camera sees contact.
    expect(touch).toBeGreaterThan(DEFAULT_CONFIG.ballRadius - 0.034);
    expect(touch).toBeLessThan(DEFAULT_CONFIG.ballRadius + 0.02);
    expect(center.y).toBeGreaterThan(strike.y - 0.01);
    expect(center.x * (side === 'left' ? -1 : 1)).toBeGreaterThan(0.02);
    const gap = bootSurfaceGap(gltf.scene, new Vector3(center.x, center.y, center.z));
    // The centre is seated into the leather so the boot reads as touching.
    expect(gap).toBeGreaterThan(-0.034);
    expect(gap).toBeLessThan(0.004);
  });

  it('skins the authored hair to the head', async () => {
    const gltf = await load(file);
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
          if (w > bestW) { bestW = w; best = index.getComponent(i, k); }
        }
        total += 1;
        if (best === head && bestW > 0.5) onHead += 1;
      }
    });
    expect(total).toBeGreaterThan(0);
    expect(onHead / total).toBeGreaterThan(0.9);
  });
});
