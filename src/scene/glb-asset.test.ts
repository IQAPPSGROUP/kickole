// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Box3, Vector3, type AnimationClip, type Bone, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { DEFAULT_CONFIG } from '../engine/config';
import {
  ANIMATION_STATES, BONE_NAMES, DEFAULT_CHARACTER_MODEL, KICK_CLIP_CONTACT_TIME, MATERIAL_NAMES, resolveBoneName, validateModel,
  type BoneKey,
} from './rig';

/** Node GLTFLoader needs a window-like global and a trivial Image for WebP textures. */
function installNodeGltfShims() {
  const g = globalThis as Record<string, unknown>;
  g.self = globalThis;
  if (!g.Image) {
    g.Image = class FakeImage {
      onload: (() => void) | null = null;
      set src(_v: string) { queueMicrotask(() => this.onload?.()); }
      get src() { return ''; }
    };
  }
}

async function loadGlb(relativePath: string, meshopt = false) {
  installNodeGltfShims();
  const buf = readFileSync(new URL(`../../public/${relativePath}`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group; animations: AnimationClip[] }>((res, rej) => {
    const loader = new GLTFLoader();
    if (meshopt) loader.setMeshoptDecoder(MeshoptDecoder);
    loader.parse(ab, '', (g) => res(g as never), rej);
  });
}

function collectBonesAndMats(scene: Group) {
  const bones: string[] = [];
  const mats = new Set<string>();
  scene.traverse((o) => {
    if ((o as Bone).isBone) bones.push(o.name);
    const m = (o as { material?: { name: string } | Array<{ name: string }> }).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((mat) => mats.add(mat.name));
  });
  return { bones, mats };
}

describe('kicky-player-rigged.glb (legacy full-contract reference)', () => {
  it('has the contract rig, materials and exactly the five named clips', async () => {
    const gltf = await loadGlb('models/kicky-player-rigged.glb');
    const { bones, mats } = collectBonesAndMats(gltf.scene);
    expect(gltf.animations.map((a) => a.name).sort()).toEqual([...ANIMATION_STATES].sort());
    expect(validateModel(bones, gltf.animations.map((a) => a.name), mats)).toEqual({ missingBones: [], missingClips: [], missingMaterials: [] });
    expect(Object.values(BONE_NAMES).every((n) => bones.includes(n))).toBe(true);
    expect(Object.values(MATERIAL_NAMES).every((n) => mats.has(n))).toBe(true);
  });

  it('is about 1.8 units tall, stands on the floor and stays mobile-light', async () => {
    const gltf = await loadGlb('models/kicky-player-rigged.glb');
    const box = new Box3().setFromObject(gltf.scene);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.7);
    expect(box.max.y - box.min.y).toBeLessThan(1.95);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
    expect(readFileSync(new URL('../../public/models/kicky-player-rigged.glb', import.meta.url)).length).toBeLessThan(500_000);
  });

  it('faces +Z (the game camera): the kick swings the foot forward in +Z', async () => {
    const gltf = await loadGlb('models/kicky-player-rigged.glb');
    const bones: Record<string, Bone> = {};
    gltf.scene.traverse((o) => { if ((o as Bone).isBone) bones[o.name] = o as Bone; });
    const mixer = new AnimationMixer(gltf.scene);
    const a = mixer.clipAction(gltf.animations.find((c) => c.name === 'KickLeft')!);
    a.play(); a.paused = true;
    a.time = 0; mixer.update(0); gltf.scene.updateMatrixWorld(true);
    const rest = bones.Foot_L.getWorldPosition(new Vector3());
    a.time = KICK_CLIP_CONTACT_TIME; mixer.update(0); gltf.scene.updateMatrixWorld(true);
    expect(bones.Foot_L.getWorldPosition(new Vector3()).z - rest.z).toBeGreaterThan(0.25);
  });

  it.each([['KickLeft', 'Foot_L', -1], ['KickRight', 'Foot_R', 1]] as const)(
    '%s: at 0.30 s the boot toe meets the ball position used by the physics engine',
    async (clip, boneName, sx) => {
      const gltf = await loadGlb('models/kicky-player-rigged.glb');
      const bones: Record<string, Bone> = {};
      gltf.scene.traverse((o) => { if ((o as Bone).isBone) bones[o.name] = o as Bone; });
      const mixer = new AnimationMixer(gltf.scene);
      const a = mixer.clipAction(gltf.animations.find((c) => c.name === clip)!);
      a.play(); a.paused = true;
      a.time = 0; mixer.update(0); gltf.scene.updateMatrixWorld(true);
      // Boot toe tip in the foot bone's local space, taken from the rest pose.
      const toeLocal = new Vector3(sx * 0.1, 0.05, 0.2).applyMatrix4(bones[boneName].matrixWorld.clone().invert());
      const c = DEFAULT_CONFIG;
      const ball = new Vector3(sx * c.footX * 0.6, c.contactHeight, c.ballZ);
      const gapAt = (t: number) => {
        a.time = t; mixer.update(0); gltf.scene.updateMatrixWorld(true);
        return toeLocal.clone().applyMatrix4(bones[boneName].matrixWorld).distanceTo(ball) - c.ballRadius;
      };
      expect(Math.abs(gapAt(KICK_CLIP_CONTACT_TIME))).toBeLessThan(0.04);
      expect(gapAt(0.26)).toBeGreaterThan(0.3); // still well away when the clip starts
    },
  );
});

describe('kickole_player_v2.glb (default Freddie gameplay model)', () => {
  it('is the default CHARACTER_MODEL path', () => {
    expect(DEFAULT_CHARACTER_MODEL).toBe('models/kickole_player_v2.glb');
  });

  it('loads with Meshopt and resolves all contract bones via UE aliases (L/R swapped)', async () => {
    const gltf = await loadGlb('models/kickole_player_v2.glb', true);
    const { bones, mats } = collectBonesAndMats(gltf.scene);
    const present = new Set(bones);
    for (const key of Object.keys(BONE_NAMES) as BoneKey[]) {
      expect(resolveBoneName(key, present), key).toBeTruthy();
    }
    // Anatomical UE left (+X) maps to game right; UE right (−X) maps to game left.
    expect(resolveBoneName('thighLeft', present)).toBe('thigh_r');
    expect(resolveBoneName('thighRight', present)).toBe('thigh_l');
    expect(resolveBoneName('armLeft', present)).toBe('upperarm_r');
    expect(resolveBoneName('armRight', present)).toBe('upperarm_l');
    expect(resolveBoneName('root', present)).toBe('pelvis');
    expect(resolveBoneName('spine', present)).toBe('spine_01');

    const report = validateModel(bones, gltf.animations.map((a) => a.name), mats);
    expect(report.missingBones).toEqual([]);
    expect(report.missingMaterials).toEqual([]);
    // Intentional contract widening: no authored clips yet — procedural pose path.
    expect(report.missingClips).toEqual([...ANIMATION_STATES]);
    expect(gltf.animations).toHaveLength(0);
    expect(Object.values(MATERIAL_NAMES).every((n) => mats.has(n))).toBe(true);
    expect(mats.has('Eyes')).toBe(true); // extra material beyond the max-8 soft budget
  });

  it('is about 1.8 units tall, feet near the floor, and under 500 KB', async () => {
    const gltf = await loadGlb('models/kickole_player_v2.glb', true);
    const box = new Box3().setFromObject(gltf.scene);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.7);
    expect(box.max.y - box.min.y).toBeLessThan(1.95);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
    expect(readFileSync(new URL('../../public/models/kickole_player_v2.glb', import.meta.url)).length).toBeLessThan(500_000);
  });

  it('places game-left foot bones on world −X (after L/R alias swap)', async () => {
    const gltf = await loadGlb('models/kickole_player_v2.glb', true);
    const { bones } = collectBonesAndMats(gltf.scene);
    const present = new Set(bones);
    const byName: Record<string, Bone> = {};
    gltf.scene.traverse((o) => { if ((o as Bone).isBone) byName[o.name] = o as Bone; });
    gltf.scene.updateMatrixWorld(true);
    const leftName = resolveBoneName('footLeft', present)!;
    const rightName = resolveBoneName('footRight', present)!;
    const left = byName[leftName].getWorldPosition(new Vector3());
    const right = byName[rightName].getWorldPosition(new Vector3());
    expect(left.x).toBeLessThan(0);
    expect(right.x).toBeGreaterThan(0);
  });
});
