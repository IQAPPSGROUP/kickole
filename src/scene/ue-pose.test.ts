// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { createPose, type Pose } from './pose';
import { MATERIAL_NAMES, UE_BONE_NAMES, rigKind, validateModel } from './rig';
import { ueDeltaQuaternion } from './ue-pose';

interface GltfNode { name?: string; rotation?: number[]; children?: number[] }

function modelLists() {
  const file = readFileSync(new URL('../../public/models/kickole_player_v2.glb', import.meta.url));
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

function worldQuaternion(nodes: GltfNode[], name: string): Quaternion {
  const parent = new Map<number, number>();
  nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const index = nodes.findIndex((n) => n.name === name);
  const chain: number[] = [];
  for (let c: number | undefined = index; c != null; c = parent.get(c)) chain.push(c);
  chain.reverse();
  const q = new Quaternion();
  for (const id of chain) {
    const r = nodes[id].rotation ?? [0, 0, 0, 1];
    q.multiply(new Quaternion(r[0], r[1], r[2], r[3]));
  }
  return q;
}

function limbDirection(nodes: GltfNode[], bone: string, key: Parameters<typeof ueDeltaQuaternion>[0], pose: Pose): Vector3 {
  const world = worldQuaternion(nodes, bone).multiply(ueDeltaQuaternion(key, pose, new Quaternion()));
  return new Vector3(0, 1, 0).applyQuaternion(world);
}

function faceDirection(nodes: GltfNode[], pose: Pose): Vector3 {
  const world = worldQuaternion(nodes, 'Head').multiply(ueDeltaQuaternion('head', pose, new Quaternion()));
  return new Vector3(0, 0, 1).applyQuaternion(world);
}

describe('kickole_player_v2.glb', () => {
  it('has the UE joints and the contract kit materials, and no clips yet', () => {
    const model = modelLists();
    expect(rigKind(model.bones)).toBe('ue');
    expect(validateModel(model.bones, model.clips, model.materials)).toEqual({
      missingBones: [],
      missingClips: ['Idle', 'KickLeft', 'KickRight', 'Miss', 'Celebrate'],
      missingMaterials: [],
    });
    expect(Object.values(UE_BONE_NAMES).every((n) => model.bones.includes(n))).toBe(true);
    expect(Object.values(MATERIAL_NAMES).every((n) => model.materials.includes(n))).toBe(true);
    expect(model.bytes).toBeLessThan(500_000);
  });

  it('drops the T-pose arms and swings the kicking leg forward', () => {
    const { nodes } = modelLists();
    const idle = createPose();
    idle.armLeft = 0.22;
    idle.armRight = 0.22;
    const rightArm = limbDirection(nodes, 'upperarm_l', 'armRight', idle);
    const leftArm = limbDirection(nodes, 'upperarm_r', 'armLeft', idle);
    expect(rightArm.y).toBeLessThan(-0.9);
    expect(rightArm.x).toBeGreaterThan(0.05);
    expect(leftArm.y).toBeLessThan(-0.9);
    expect(leftArm.x).toBeLessThan(-0.05);

    const kick = createPose();
    kick.legs.right.thigh = -0.9;
    const thigh = limbDirection(nodes, 'thigh_l', 'thighRight', kick);
    expect(thigh.z).toBeGreaterThan(0.45);

    const bent = createPose();
    bent.legs.right.knee = 0.9;
    const shin = limbDirection(nodes, 'calf_l', 'shinRight', bent);
    expect(shin.z).toBeLessThan(-0.35);

    const up = createPose();
    up.armLeft = 2.7;
    up.armRight = 2.7;
    expect(limbDirection(nodes, 'upperarm_l', 'armRight', up).y).toBeGreaterThan(0.7);
    expect(limbDirection(nodes, 'upperarm_r', 'armLeft', up).y).toBeGreaterThan(0.7);
  });

  it('looks at the ball and leans the chest toward it', () => {
    const { nodes } = modelLists();
    const down = createPose();
    down.headPitch = 0.7;
    expect(faceDirection(nodes, down).y).toBeLessThan(-0.25);

    const yaw = createPose();
    yaw.headYaw = 0.7;
    expect(faceDirection(nodes, yaw).x).toBeGreaterThan(0.25);

    const lean = createPose();
    lean.torsoRoll = -0.45;
    expect(limbDirection(nodes, 'spine_01', 'spine', lean).x).toBeGreaterThan(0.2);

    const bow = createPose();
    bow.torsoPitch = 0.4;
    expect(limbDirection(nodes, 'spine_01', 'spine', bow).z).toBeGreaterThan(0.25);
  });
});
