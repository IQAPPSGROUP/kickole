// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Box3, Vector3, type AnimationClip, type Bone, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DEFAULT_CONFIG } from '../engine/config';
import { ANIMATION_STATES, BONE_NAMES, KICK_CLIP_CONTACT_TIME, MATERIAL_NAMES, validateModel } from './rig';

async function load() {
  const buf = readFileSync(new URL('../../public/models/kicky-player-rigged.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group; animations: AnimationClip[] }>((res, rej) => new GLTFLoader().parse(ab, '', (g) => res(g as never), rej));
}

describe('kicky-player-rigged.glb', () => {
  it('has the contract rig, materials and exactly the five named clips', async () => {
    const gltf = await load();
    const bones: string[] = []; const mats = new Set<string>();
    gltf.scene.traverse((o) => {
      if ((o as Bone).isBone) bones.push(o.name);
      const m = (o as { material?: { name: string } }).material; if (m) mats.add(m.name);
    });
    expect(gltf.animations.map((a) => a.name).sort()).toEqual([...ANIMATION_STATES].sort());
    expect(validateModel(bones, gltf.animations.map((a) => a.name), mats)).toEqual({ missingBones: [], missingClips: [], missingMaterials: [] });
    expect(Object.values(BONE_NAMES).every((n) => bones.includes(n))).toBe(true);
    expect(Object.values(MATERIAL_NAMES).every((n) => mats.has(n))).toBe(true);
  });

  it('is about 1.8 units tall, stands on the floor and stays mobile-light', async () => {
    const gltf = await load();
    const box = new Box3().setFromObject(gltf.scene);
    expect(box.max.y - box.min.y).toBeGreaterThan(1.7);
    expect(box.max.y - box.min.y).toBeLessThan(1.95);
    expect(Math.abs(box.min.y)).toBeLessThan(0.02);
    expect(readFileSync(new URL('../../public/models/kicky-player-rigged.glb', import.meta.url)).length).toBeLessThan(500_000);
  });

  it('faces +Z (the game camera): the kick swings the foot forward in +Z', async () => {
    const gltf = await load();
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
      const gltf = await load();
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
