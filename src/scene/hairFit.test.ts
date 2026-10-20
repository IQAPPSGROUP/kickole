// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Matrix4, Texture, Vector3, type Bone, type Group, type SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { HAIR_STYLES, type HairStyle } from '../game/appearance';
import {
  HAIR_SKULLS,
  HAIR_SPRING_LIMIT,
  hairEyePlaneHits,
  hairFaceHits,
  hairParts,
  hairScalpGap,
  uncoveredScalp,
  pointInFaceBox,
  type HairBody,
  type HairSpring,
} from './hairFit';

const BODIES: HairBody[] = ['male', 'female', 'primitive'];

const SPRINGS: HairSpring[] = [
  { pitch: 0, yaw: 0, roll: 0 },
  { pitch: HAIR_SPRING_LIMIT.pitch, yaw: HAIR_SPRING_LIMIT.yaw, roll: HAIR_SPRING_LIMIT.roll },
  { pitch: -HAIR_SPRING_LIMIT.pitch, yaw: -HAIR_SPRING_LIMIT.yaw, roll: -HAIR_SPRING_LIMIT.roll },
  { pitch: HAIR_SPRING_LIMIT.pitch, yaw: -HAIR_SPRING_LIMIT.yaw, roll: HAIR_SPRING_LIMIT.roll },
  { pitch: -HAIR_SPRING_LIMIT.pitch, yaw: HAIR_SPRING_LIMIT.yaw, roll: -HAIR_SPRING_LIMIT.roll },
];

const MALE = new URL('../../public/models/kickole_player_v4.glb', import.meta.url);
const FEMALE = new URL('../../public/models/kickole_player_v4_female.glb', import.meta.url);

async function load(file: URL) {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise<{ scene: Group }>((res, rej) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({
      name: 'KHR_texture_basisu',
      loadTexture: () => Promise.resolve(new Texture()),
    }));
    loader.parse(ab, '', (gltf) => res(gltf as never), rej);
  });
}

const bindPosition = new Vector3();
const weighted = new Vector3();
const skinnedWorld = new Vector3();
const boneWorld = new Matrix4();

function authoredHairInHead(scene: Group): Vector3[] {
  const heads: Bone[] = [];
  scene.updateMatrixWorld(true);
  scene.traverse((obj) => {
    const bone = obj as Bone;
    if (bone.isBone && bone.name === 'Head') heads.push(bone);
  });
  const skullBone = heads[0];
  if (!skullBone) throw new Error('missing Head bone');
  const points: Vector3[] = [];
  scene.traverse((obj) => {
    const mesh = obj as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some((material) => material.name === 'Hair')) return;
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
      points.push(skullBone.worldToLocal(skinnedWorld.clone()));
    }
  });
  return points;
}

describe('hair fit', () => {
  it('keeps the measured landmarks inside the face volume', () => {
    for (const body of BODIES) {
      const skull = HAIR_SKULLS[body];
      for (const landmark of Object.values(skull.landmarks)) {
        expect(pointInFaceBox(landmark, skull.face), body).toBe(true);
      }
    }
  });

  it('does not let any hairstyle cover the face, even at the hair-spring limit', () => {
    for (const style of HAIR_STYLES.map((entry) => entry.id)) {
      for (const body of BODIES) {
        for (const spring of SPRINGS) {
          const hits = hairFaceHits(style, body, spring);
          expect(hits, `${style} ${body} pitch ${spring.pitch} yaw ${spring.yaw}`).toEqual([]);
          const eyes = hairEyePlaneHits(style, body, spring);
          expect(eyes, `${style} ${body} eye plane yaw ${spring.yaw}`).toEqual([]);
        }
      }
    }
  });

  it('anchors every visible style to the scalp', () => {
    const visible: HairStyle[] = ['afro', 'mohawk', 'highTop', 'curls', 'braids', 'spikes', 'shaved'];
    for (const style of visible) {
      for (const body of BODIES) {
        expect(hairParts(style, body).length, style).toBeGreaterThan(0);
        const gap = hairScalpGap(style, body);
        expect(gap, `${style} ${body}`).toBeLessThan(0.045);
        expect(gap, `${style} ${body} buried`).toBeGreaterThan(-0.04);
      }
    }
  });

  it('covers the crown for a full afro and a seated high-top', () => {
    for (const body of ['male', 'female', 'primitive'] as const) {
      expect(uncoveredScalp('afro', body, [0.12, 0.7]), `afro ${body}`).toEqual([]);
      expect(uncoveredScalp('highTop', body, [0.12, 0.38]), `high-top ${body}`).toEqual([]);
      const part = hairParts('highTop', body)[0];
      expect(part.shape).toBe('cylinder');
      if (part.shape !== 'cylinder') continue;
      const eyeZ = Math.min(HAIR_SKULLS[body].landmarks.leftEye.z, HAIR_SKULLS[body].landmarks.rightEye.z);
      const front = part.position[2] + part.radiusBottom;
      expect(front, `${body} visor`).toBeLessThan(eyeZ - 0.01);
      expect(part.position[1] + part.height / 2, `${body} height`).toBeGreaterThan(HAIR_SKULLS[body].crownY + HAIR_SKULLS[body].radius * 0.45);
    }
  });

  it('gives the afro volume outside the scalp without a face-covering sphere', () => {
    for (const body of ['male', 'female'] as const) {
      const [afro] = hairParts('afro', body);
      expect(afro.shape).toBe('sphere');
      if (afro.shape !== 'sphere') continue;
      expect(afro.radius).toBeGreaterThan(HAIR_SKULLS[body].radius + 0.03);
      expect(afro.phiLength).toBeLessThan(Math.PI * 2);
    }
    expect(hairParts('bald', 'male')).toEqual([]);
    expect(hairParts('short', 'male')).toEqual([]);
    expect(hairParts('short', 'primitive').length).toBeGreaterThan(0);
  });

  it('keeps authored short hair and the ponytail out of the face volume', async () => {
    const male = await load(MALE);
    const female = await load(FEMALE);
    const maleHair = authoredHairInHead(male.scene);
    const femaleHair = authoredHairInHead(female.scene);
    expect(maleHair.length).toBeGreaterThan(0);
    expect(femaleHair.length).toBeGreaterThan(0);
    const maleHits = maleHair.filter((p) => pointInFaceBox(p, HAIR_SKULLS.male.face));
    const femaleHits = femaleHair.filter((p) => pointInFaceBox(p, HAIR_SKULLS.female.face));
    expect(maleHits).toEqual([]);
    expect(femaleHits).toEqual([]);
  });
});
