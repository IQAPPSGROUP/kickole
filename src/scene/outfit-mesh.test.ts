// @vitest-environment node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix4, Texture, Vector3, type AnimationClip, type Group, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MESH_OUTFIT_IDS } from '../game/outfitMesh';
import { bindOutfit } from './outfitBind';

const MALE = new URL('../../public/models/kickole_player_v4.glb', import.meta.url);
const FEMALE = new URL('../../public/models/kickole_player_v4_female.glb', import.meta.url);
const OUTFIT_DIR = new URL('../../public/models/outfits/', import.meta.url);

function glbJson(file: URL) {
  const bytes = readFileSync(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length))) as {
    images?: unknown[];
    materials?: { name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; roughnessFactor?: number; metallicFactor?: number } }[];
    skins?: { joints: number[] }[];
    nodes?: { name?: string }[];
  };
}

async function load(file: URL) {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group; animations: AnimationClip[] }>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new Texture()) }));
    loader.parse(ab, '', (gltf) => resolve(gltf as never), reject);
  });
}

const bindPosition = new Vector3();
const weighted = new Vector3();
const skinnedWorld = new Vector3();
const boneWorld = new Matrix4();

function skinnedSamples(mesh: SkinnedMesh, limit: number): Vector3[] {
  mesh.skeleton.update();
  const position = mesh.geometry.attributes.position;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  if (!position || !skinIndex || !skinWeight) return [];
  const step = Math.max(1, Math.floor(position.count / limit));
  const out: Vector3[] = [];
  for (let i = 0; i < position.count; i += step) {
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
    out.push(skinnedWorld.clone());
  }
  return out;
}

function nearest(point: Vector3, cloud: Vector3[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const other of cloud) best = Math.min(best, point.distanceTo(other));
  return best;
}

describe('skinned outfit meshes', () => {
  it('ships a small texture-free GLB for both bodies', () => {
    const files = readdirSync(OUTFIT_DIR).filter((name) => name.endsWith('.glb')).sort();
    const expected = MESH_OUTFIT_IDS.flatMap((id) => [`${id}-female.glb`, `${id}-male.glb`]).sort();
    expect(files).toEqual(expected);
    for (const name of files) {
      const file = new URL(name, OUTFIT_DIR);
      expect(statSync(file).size, name).toBeLessThan(180_000);
      const json = glbJson(file);
      expect(json.images ?? [], name).toEqual([]);
      const materials = (json.materials ?? []).map((material) => material.name ?? '');
      const banned = name.startsWith('ring-mask')
        ? /bat|cowl|emblem|blood|stripe|wound|gore|badge/i
        : /bat|cape|cowl|emblem|blood|stripe|wound|gore|badge/i;
      expect(materials.join(' '), name).not.toMatch(banned);
      const sole = (json.materials ?? []).find((material) => material.name === 'sole');
      const boot = (json.materials ?? []).find((material) => material.name === 'boot');
      expect(sole && boot, name).toBeTruthy();
      const soleColor = sole?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      expect(Math.max(soleColor[0], soleColor[1], soleColor[2]), `${name} sole`).toBeLessThan(0.2);
      expect(json.skins?.[0].joints).toHaveLength(20);
    }
    const shadow = glbJson(new URL('night-glider-male.glb', OUTFIT_DIR));
    expect((shadow.materials ?? []).map((material) => material.name)).toEqual([
      'suit', 'panel', 'belt', 'hood', 'visor', 'triangle', 'glove', 'seam', 'boot', 'sole',
    ]);
    const knight = glbJson(new URL('keep-guard-male.glb', OUTFIT_DIR));
    const knightNames = (knight.materials ?? []).map((material) => material.name);
    expect(knightNames).toEqual(expect.arrayContaining([
      'breastplate', 'pauldron', 'gauntlet', 'helmet', 'visor', 'tabard', 'greave', 'boot',
    ]));
    for (const material of knight.materials ?? []) {
      if (!['breastplate', 'pauldron', 'vambrace', 'gauntlet', 'greave', 'helmet', 'boot'].includes(material.name ?? '')) continue;
      const rough = material.pbrMetallicRoughness?.roughnessFactor ?? 1;
      const metal = material.pbrMetallicRoughness?.metallicFactor ?? 1;
      expect(rough, material.name).toBeGreaterThan(0.5);
      expect(metal, material.name).toBeLessThan(0.35);
    }
    const pirate = (glbJson(new URL('deck-hand-male.glb', OUTFIT_DIR)).materials ?? []).map((material) => material.name ?? '');
    expect(pirate).toContain('hat');
    expect(pirate.join(' ')).not.toMatch(/emblem|skull|cross|bone/i);
    const zombieMats = glbJson(new URL('grey-ghoul-male.glb', OUTFIT_DIR)).materials ?? [];
    expect(zombieMats.map((material) => material.name ?? '').join(' ')).not.toMatch(/blood|gore|wound/i);
    for (const material of zombieMats) {
      const color = material.pbrMetallicRoughness?.baseColorFactor ?? [0, 0, 0];
      expect(color[0] - Math.max(color[1], color[2]), material.name).toBeLessThan(0.15);
    }
    const hero = (glbJson(new URL('street-hero-male.glb', OUTFIT_DIR)).materials ?? []).map((material) => material.name ?? '');
    expect(hero).toContain('wristband');
    expect(hero.join(' ')).not.toMatch(/cape|cowl|emblem/i);
    const dino = glbJson(new URL('spike-hood-male.glb', OUTFIT_DIR));
    expect((dino.materials ?? []).map((material) => material.name)).toEqual(
      expect.arrayContaining(['suit', 'belly', 'hood', 'spike', 'tail', 'boot', 'sole']),
    );
  });

  it('stays on the body surface when bound to the v4 skeleton', async () => {
    const male = await load(MALE);
    const maleCloud = bodyCloud(male.scene);
    const female = await load(FEMALE);
    const femaleCloud = bodyCloud(female.scene);
    for (const id of MESH_OUTFIT_IDS) {
      for (const [body, scene, cloud] of [
        ['male', male.scene, maleCloud],
        ['female', female.scene, femaleCloud],
      ] as const) {
        const outfit = await load(new URL(`${id}-${body}.glb`, OUTFIT_DIR));
        const meshes = bindOutfit(scene, outfit.scene);
        scene.updateMatrixWorld(true);
        expect(meshes.length, `${id} ${body}`).toBeGreaterThan(0);
        const samples = meshes.flatMap((mesh) => skinnedSamples(mesh, 180));
        expect(samples.length, `${id} ${body}`).toBeGreaterThan(40);
        const gaps = samples.map((point) => nearest(point, cloud)).sort((a, b) => a - b);
        const median = gaps[Math.floor(gaps.length / 2)];
        expect(median, `${id} ${body}`).toBeLessThan(0.08);
        expect(gaps[gaps.length - 1], `${id} ${body}`).toBeLessThan(0.6);
        for (const mesh of meshes) mesh.parent?.remove(mesh);
      }
    }
  });
});

function bodyCloud(scene: Group): Vector3[] {
  scene.updateMatrixWorld(true);
  const cloud: Vector3[] = [];
  scene.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    cloud.push(...skinnedSamples(mesh, 700));
  });
  if (cloud.length < 100) throw new Error('body cloud is empty');
  return cloud;
}
