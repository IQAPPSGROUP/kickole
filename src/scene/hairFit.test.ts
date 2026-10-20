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
  hairBounds,
  hairEyePlaneHits,
  hairFaceHits,
  hairParts,
  hairScalpGap,
  pointInFaceBox,
  scalpSurfacePoints,
  uncoveredScalp,
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
      const skull = HAIR_SKULLS[body];
      expect(uncoveredScalp('afro', body, [0.12, 0.7]), `afro ${body}`).toEqual([]);
      expect(uncoveredScalp('highTop', body, [0.12, 0.38]), `high-top ${body}`).toEqual([]);
      const bounds = hairBounds('highTop', body);
      const eyeZ = Math.min(skull.landmarks.leftEye.z, skull.landmarks.rightEye.z);
      expect(bounds.max.z, `${body} visor`).toBeLessThan(eyeZ - 0.01);
      expect(bounds.max.y, `${body} height`).toBeGreaterThan(skull.crownY + skull.radius * 0.45);
      const flat = hairParts('highTop', body).filter((card) => card.id.startsWith('high-top-'));
      expect(flat.length, `${body} flat top`).toBeGreaterThan(8);
      for (const card of flat) {
        for (const sample of [bounds.max.y]) {
          expect(Math.abs(card.position[1] - sample), card.id).toBeLessThan(0.02);
        }
      }
    }
  });

  it('gives each style its own shape and keeps the authored short hair', () => {
    for (const body of ['male', 'female'] as const) {
      const skull = HAIR_SKULLS[body];
      const afro = hairBounds('afro', body);
      const curls = hairBounds('curls', body);
      const mohawk = hairBounds('mohawk', body);
      const spikes = hairBounds('spikes', body);
      const shaved = hairBounds('shaved', body);
      const braids = hairBounds('braids', body);
      const afroR = afro.max.distanceTo(skull.center);
      const curlR = curls.max.distanceTo(skull.center);
      expect(afroR, body).toBeGreaterThan(skull.radius + 0.03);
      expect(afroR, body).toBeGreaterThan(curlR + 0.015);
      expect(mohawk.max.x - mohawk.min.x, body).toBeLessThan(0.055);
      expect(mohawk.max.y, body).toBeGreaterThan(skull.crownY + skull.radius * 0.4);
      expect(braids.min.y, body).toBeLessThan(skull.center.y - 0.04);
      expect(new Set(hairParts('braids', body).map((card) => card.atlas))).toEqual(new Set(['braid']));
      expect(new Set(hairParts('curls', body).map((card) => card.atlas))).toEqual(new Set(['curl']));
      expect(new Set(hairParts('shaved', body).map((card) => card.atlas))).toEqual(new Set(['stubble']));
      expect(Math.max(...hairParts('shaved', body).map((card) => card.height)), body).toBeLessThan(0.016);
      expect(spikes.max.y, body).toBeGreaterThan(shaved.max.y + skull.radius * 0.4);
      expect(hairParts('afro', body).some((card) => card.atlas === 'strand')).toBe(true);
    }
    expect(hairParts('bald', 'male')).toEqual([]);
    expect(hairParts('short', 'male')).toEqual([]);
    expect(hairParts('short', 'primitive').length).toBeGreaterThan(0);
  });

  it('covers painted hair with a scalp cap that stays off the face', () => {
    for (const body of BODIES) {
      const skull = HAIR_SKULLS[body];
      const points = scalpSurfacePoints(body);
      expect(points.length).toBeGreaterThan(20);
      const faceHits = points.filter((p) => pointInFaceBox(p, skull.face));
      expect(faceHits, body).toEqual([]);
      const crown = points.some((p) => p.y > skull.crownY - skull.radius * 0.15);
      expect(crown, body).toBe(true);
    }
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
