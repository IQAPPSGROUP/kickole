// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Quaternion, Texture, Vector3, type Bone, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { applyContractBones } from './contractPose';
import { createPose } from './pose';
import { BONE_NAMES, EXTRA_BONE_NAMES, MATERIAL_NAMES, UE_BONE_NAMES, rigKind, validateModel, type BoneKey } from './rig';

interface GltfNode { name?: string; rotation?: number[]; children?: number[] }

function modelLists() {
  const file = readFileSync(new URL('../../public/models/kickole_player_v4.glb', import.meta.url));
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength);
  const jsonLen = view.getUint32(12, true);
  const jsonBytes = new Uint8Array(file.buffer, file.byteOffset + 20, jsonLen);
  const gltf = JSON.parse(new TextDecoder().decode(jsonBytes)) as {
    nodes: GltfNode[];
    materials?: { name?: string }[];
    animations?: { name?: string }[];
  };
  return {
    bones: gltf.nodes.map((n) => n.name).filter((n): n is string => !!n),
    clips: (gltf.animations ?? []).map((a) => a.name ?? ''),
    materials: (gltf.materials ?? []).map((m) => m.name ?? ''),
    bytes: file.length,
    nodes: gltf.nodes,
  };
}

async function loadPlayer(): Promise<Group> {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(new URL('../../public/models/kickole_player_v4.glb', import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const gltf = await new Promise<{ scene: Group }>((res, rej) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({ name: 'KHR_texture_basisu', loadTexture: () => Promise.resolve(new Texture()) }));
    loader.parse(ab, '', (g) => res(g as { scene: Group }), rej);
  });
  return gltf.scene;
}

function contractBones(scene: Group): Partial<Record<BoneKey, Bone>> {
  const names = { ...BONE_NAMES, ...EXTRA_BONE_NAMES };
  const bones: Partial<Record<BoneKey, Bone>> = {};
  scene.traverse((obj) => {
    for (const key of Object.keys(names) as BoneKey[]) {
      if (obj.name === names[key]) bones[key] = obj as Bone;
    }
  });
  return bones;
}

function limbDirection(bones: Partial<Record<BoneKey, Bone>>, key: BoneKey): Vector3 {
  return new Vector3(0, 1, 0).applyQuaternion(bones[key]!.getWorldQuaternion(new Quaternion()));
}

describe('kickole_player_v4.glb pose', () => {
  it('has the contract joints, the kit materials and the five clips', () => {
    const model = modelLists();
    expect(rigKind(model.bones)).toBe('contract');
    expect(validateModel(model.bones, model.clips, model.materials)).toEqual({
      missingBones: [],
      missingClips: [],
      missingMaterials: [],
    });
    expect(Object.values(UE_BONE_NAMES).every((n) => model.bones.includes(n))).toBe(false);
    expect(Object.values(MATERIAL_NAMES).every((n) => model.materials.includes(n))).toBe(true);
    expect(model.bytes).toBeLessThan(8_000_000);
  });

  it('drops the T-pose arms and swings the kicking leg forward', async () => {
    const scene = await loadPlayer();
    const bones = contractBones(scene);
    const hand = (name: string) => scene.getObjectByName(name)!.getWorldPosition(new Vector3());
    const idle = createPose();
    idle.armLeft = 0.22;
    idle.armRight = 0.22;
    applyContractBones(bones, idle, 0);
    scene.updateMatrixWorld(true);
    const rightHand = hand('Hand_R');
    const leftHand = hand('Hand_L');
    expect(rightHand.y).toBeLessThan(bones.armRight!.getWorldPosition(new Vector3()).y - 0.15);
    expect(leftHand.y).toBeLessThan(bones.armLeft!.getWorldPosition(new Vector3()).y - 0.15);
    expect(Math.abs(rightHand.x)).toBeGreaterThan(0.05);
    expect(Math.abs(leftHand.x)).toBeGreaterThan(0.05);
    expect(rightHand.x * leftHand.x).toBeLessThan(0);
    const idleRight = rightHand.y;
    const idleLeft = leftHand.y;

    const kick = createPose();
    kick.legs.right.thigh = -0.9;
    applyContractBones(bones, kick, 0);
    scene.updateMatrixWorld(true);
    const kicked = bones.footRight!.getWorldPosition(new Vector3()).z;

    const bent = createPose();
    bent.legs.right.knee = 0.9;
    applyContractBones(bones, bent, 0);
    scene.updateMatrixWorld(true);
    expect(bones.footRight!.getWorldPosition(new Vector3()).z).toBeLessThan(kicked);

    const up = createPose();
    up.armLeft = 2.7;
    up.armRight = 2.7;
    applyContractBones(bones, up, 0);
    scene.updateMatrixWorld(true);
    expect(hand('Hand_R').y).toBeGreaterThan(idleRight + 0.12);
    expect(hand('Hand_L').y).toBeGreaterThan(idleLeft + 0.12);
  });

  it('looks at the ball and leans the chest toward it', async () => {
    const scene = await loadPlayer();
    const bones = contractBones(scene);
    const down = createPose();
    down.headPitch = 0.7;
    applyContractBones(bones, down, 0);
    scene.updateMatrixWorld(true);
    const face = new Vector3(0, 0, 1).applyQuaternion(bones.head!.getWorldQuaternion(new Quaternion()));
    expect(face.y).toBeLessThan(-0.25);

    const yaw = createPose();
    yaw.headYaw = 0.7;
    applyContractBones(bones, yaw, 0);
    scene.updateMatrixWorld(true);
    const turned = new Vector3(0, 0, 1).applyQuaternion(bones.head!.getWorldQuaternion(new Quaternion()));
    expect(turned.x).toBeGreaterThan(0.25);

    const lean = createPose();
    lean.torsoRoll = -0.45;
    applyContractBones(bones, lean, 0);
    scene.updateMatrixWorld(true);
    expect(limbDirection(bones, 'spine').x).toBeGreaterThan(0.2);

    const bow = createPose();
    bow.torsoPitch = 0.4;
    applyContractBones(bones, bow, 0);
    scene.updateMatrixWorld(true);
    expect(limbDirection(bones, 'spine').z).toBeGreaterThan(0.25);
  });
});
