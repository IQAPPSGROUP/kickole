/**
 * Build public/models/kickole_player_v3.glb from the Quaternius CC0 v2 mesh.
 *
 * v2 is a 65-bone UE mannequin with no clips, an extra Eyes material and ~16.9k
 * triangles. v3 renames that skeleton to the game contract (screen-left `_L`),
 * drops finger bones, folds the eyes into the skin atlas, simplifies under 15k
 * triangles and bakes Idle / KickLeft / KickRight / Miss / Celebrate in place.
 *
 * Run: node --experimental-strip-types tools/build_player_v3.ts
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import type { Node, Primitive, Skin } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { Group, Quaternion, Vector3 } from 'three';
import { GameEngine } from '../src/engine/engine';
import type { Side } from '../src/engine/config';
import { computePose, type Pose } from '../src/scene/pose';
import { ueDeltaQuaternion } from '../src/scene/ue-pose';

const SRC = new URL('../public/models/kickole_player_v2.glb', import.meta.url);
const OUT = new URL('../public/models/kickole_player_v3.glb', import.meta.url);

/** Game-left is world −X. Quaternius `_l` is anatomical left (world +X), so sides swap. */
const RENAME: Record<string, string> = {
  root: 'Root',
  pelvis: 'Hips',
  spine_01: 'Spine',
  spine_02: 'Spine2',
  spine_03: 'Spine3',
  neck_01: 'Neck',
  Head: 'Head',
  clavicle_l: 'Clavicle_R',
  clavicle_r: 'Clavicle_L',
  upperarm_l: 'UpperArm_R',
  upperarm_r: 'UpperArm_L',
  lowerarm_l: 'LowerArm_R',
  lowerarm_r: 'LowerArm_L',
  hand_l: 'Hand_R',
  hand_r: 'Hand_L',
  thigh_l: 'UpperLeg_R',
  thigh_r: 'UpperLeg_L',
  calf_l: 'LowerLeg_R',
  calf_r: 'LowerLeg_L',
  foot_l: 'Foot_R',
  foot_r: 'Foot_L',
  ball_l: 'Toe_R',
  ball_r: 'Toe_L',
};

/** Pose keys → the v2 bone the existing solver was tuned on. */
const KEY_TO_OLD: Record<string, string> = {
  root: 'pelvis',
  spine: 'spine_01',
  neck: 'neck_01',
  head: 'Head',
  armLeft: 'upperarm_r',
  armRight: 'upperarm_l',
  elbowLeft: 'lowerarm_r',
  elbowRight: 'lowerarm_l',
  thighLeft: 'thigh_r',
  thighRight: 'thigh_l',
  shinLeft: 'calf_r',
  shinRight: 'calf_l',
  footLeft: 'foot_r',
  footRight: 'foot_l',
};

const POSE_KEYS = Object.keys(KEY_TO_OLD);

function isDropped(name: string): boolean {
  return /^(index|middle|ring|pinky|thumb)_/.test(name) || name.startsWith('ball_leaf');
}

function keptAncestor(node: Node): Node {
  let current: Node | null = node;
  while (current && isDropped(current.getName())) current = current.getParentNode();
  if (!current) throw new Error(`No kept ancestor for ${node.getName()}`);
  return current;
}

function retargetWeights(prim: Primitive, redirect: number[]): void {
  const joints = prim.getAttribute('JOINTS_0');
  const weights = prim.getAttribute('WEIGHTS_0');
  if (!joints || !weights) return;
  const j = joints.getArray();
  const w = weights.getArray();
  if (!j || !w) return;
  const nextJ = new (j.constructor as Uint16ArrayConstructor)(j.length);
  const nextW = new Float32Array(w.length);
  const count = joints.getCount();
  for (let v = 0; v < count; v++) {
    const acc = new Map<number, number>();
    for (let k = 0; k < 4; k++) {
      const weight = w[v * 4 + k];
      if (weight <= 1e-5) continue;
      const ni = redirect[j[v * 4 + k]] ?? 0;
      acc.set(ni, (acc.get(ni) ?? 0) + weight);
    }
    const top = [...acc.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = top.reduce((s, e) => s + e[1], 0) || 1;
    for (let k = 0; k < 4; k++) {
      nextJ[v * 4 + k] = top[k] ? top[k][0] : 0;
      nextW[v * 4 + k] = top[k] ? top[k][1] / sum : 0;
    }
  }
  joints.setArray(nextJ);
  weights.setArray(nextW);
}

async function simplifyPrimitive(prim: Primitive, ratio: number): Promise<number> {
  const idx = prim.getIndices();
  const pos = prim.getAttribute('POSITION');
  if (!idx || !pos) return 0;
  const indices = new Uint32Array(idx.getArray()!);
  const positions = new Float32Array(pos.getArray()!);
  const target = Math.max(12, Math.floor((indices.length * ratio) / 3) * 3);
  const [out] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.02, ['LockBorder']);
  const max = out.reduce((m, v) => Math.max(m, v), 0);
  idx.setArray(max < 65535 ? new Uint16Array(out) : out);
  return out.length / 3;
}

function scaleUvs(prim: Primitive, map: (u: number, v: number) => [number, number]): void {
  const uv = prim.getAttribute('TEXCOORD_0');
  if (!uv) return;
  const arr = new Float32Array(uv.getArray()!);
  for (let i = 0; i < arr.length; i += 2) {
    const [u, v] = map(arr[i], arr[i + 1]);
    arr[i] = u;
    arr[i + 1] = v;
  }
  uv.setArray(arr);
}

async function foldEyesIntoSkin(doc: ReturnType<NodeIO['read']> extends Promise<infer T> ? T : never): Promise<void> {
  const root = doc.getRoot();
  const skinMat = root.listMaterials().find((m) => m.getName() === 'Skin');
  const eyeMat = root.listMaterials().find((m) => m.getName() === 'Eyes');
  if (!skinMat || !eyeMat) throw new Error('Skin or Eyes material missing');
  const skinTex = skinMat.getBaseColorTexture();
  const eyeTex = eyeMat.getBaseColorTexture();
  if (!skinTex?.getImage() || !eyeTex?.getImage()) throw new Error('Skin or eye texture missing');

  const skinBuf = Buffer.from(skinTex.getImage()!);
  const meta = await sharp(skinBuf).metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const eyeSize = Math.round(width * 0.22);
  const skinScaled = await sharp(skinBuf).resize(Math.round(width * 0.74), height, { fit: 'fill' }).png().toBuffer();
  const eyeScaled = await sharp(Buffer.from(eyeTex.getImage()!)).resize(eyeSize, eyeSize, { fit: 'fill' }).png().toBuffer();
  const composed = await sharp({
    create: { width, height, channels: 3, background: { r: 232, g: 180, b: 143 } },
  }).composite([
    { input: skinScaled, left: 0, top: 0 },
    { input: eyeScaled, left: Math.round(width * 0.76), top: Math.round(height * 0.02) },
  ]).webp({ quality: 80 }).toBuffer();

  skinTex.setImage(new Uint8Array(composed)).setMimeType('image/webp');
  for (const material of root.listMaterials()) material.setNormalTexture(null);

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial() === eyeMat) {
        scaleUvs(prim, (u, v) => [0.76 + u * 0.22, 0.02 + (1 - v) * 0.22]);
        prim.setMaterial(skinMat);
      } else if (prim.getMaterial() === skinMat) {
        scaleUvs(prim, (u, v) => [u * 0.74, v]);
      }
    }
  }
}

function freshEngine(): GameEngine {
  const engine = new GameEngine();
  engine.phase = 'menu';
  engine.trick = null;
  engine.contact = null;
  engine.selectedTrick = null;
  engine.lastPerfectTime = -10;
  engine.lastDropTime = -10;
  engine.lastKick.left = -10;
  engine.lastKick.right = -10;
  engine.lastContact.left = -10;
  engine.lastContact.right = -10;
  return engine;
}

function contactEngine(side: Side, dt: number): GameEngine {
  const engine = freshEngine();
  engine.phase = 'playing';
  engine.time = 5;
  const sign = side === 'left' ? -1 : 1;
  engine.ball.x = sign * engine.config.footX * 0.6;
  engine.ball.y = engine.config.contactHeight;
  engine.ball.z = engine.config.ballZ;
  engine.ball.vy = -0.2;
  engine.lastKick[side] = engine.time - dt;
  return engine;
}

function followEngine(side: Side, since: number): GameEngine {
  const engine = contactEngine(side, 0.04);
  engine.lastContact[side] = engine.time - since;
  engine.lastKick[side] = engine.lastContact[side] - 0.04;
  return engine;
}

function clonePose(pose: Pose): Pose {
  return {
    ...pose,
    legs: {
      left: { ...pose.legs.left },
      right: { ...pose.legs.right },
    },
  };
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = clonePose(a);
  out.bodyY = lerp(a.bodyY, b.bodyY, t);
  out.bodyYaw = lerp(a.bodyYaw, b.bodyYaw, t);
  out.torsoPitch = lerp(a.torsoPitch, b.torsoPitch, t);
  out.torsoYaw = lerp(a.torsoYaw, b.torsoYaw, t);
  out.torsoRoll = lerp(a.torsoRoll, b.torsoRoll, t);
  out.neckPitch = lerp(a.neckPitch, b.neckPitch, t);
  out.neckYaw = lerp(a.neckYaw, b.neckYaw, t);
  out.headYaw = lerp(a.headYaw, b.headYaw, t);
  out.headPitch = lerp(a.headPitch, b.headPitch, t);
  out.armLeft = lerp(a.armLeft, b.armLeft, t);
  out.armRight = lerp(a.armRight, b.armRight, t);
  out.armLeftPitch = lerp(a.armLeftPitch, b.armLeftPitch, t);
  out.armRightPitch = lerp(a.armRightPitch, b.armRightPitch, t);
  out.elbowLeft = lerp(a.elbowLeft, b.elbowLeft, t);
  out.elbowRight = lerp(a.elbowRight, b.elbowRight, t);
  for (const side of ['left', 'right'] as const) {
    const from = a.legs[side];
    const to = b.legs[side];
    out.legs[side] = {
      thigh: lerp(from.thigh, to.thigh, t),
      knee: lerp(from.knee, to.knee, t),
      abduct: lerp(from.abduct, to.abduct, t),
      twist: lerp(from.twist, to.twist, t),
      foot: lerp(from.foot, to.foot, t),
      ankleRoll: lerp(from.ankleRoll, to.ankleRoll, t),
      ankleYaw: lerp(from.ankleYaw, to.ankleYaw, t),
    };
  }
  return out;
}

function idlePose(time: number): Pose {
  const engine = freshEngine();
  engine.time = time;
  const pose = computePose(engine);
  pose.torsoRoll += Math.sin(time * 1.3) * 0.045;
  pose.torsoYaw += Math.sin(time * 0.7) * 0.04;
  pose.headYaw += Math.sin(time * 0.55) * 0.1;
  pose.armLeft += Math.sin(time * 1.15) * 0.035;
  pose.armRight += Math.sin(time * 1.15 + 0.4) * 0.035;
  return pose;
}

function windupPose(side: Side): Pose {
  const pose = idlePose(0);
  pose.legs[side].thigh = 0.42;
  pose.legs[side].knee = 0.95;
  pose.legs[side].foot = -0.25;
  pose.torsoPitch = -0.06;
  const other: Side = side === 'left' ? 'right' : 'left';
  if (side === 'left') pose.armRight = 0.45;
  else pose.armLeft = 0.45;
  pose.legs[other].knee = 0.08;
  return pose;
}

function kickPoses(side: Side): Array<[number, Pose]> {
  const idle = idlePose(0);
  const wind = windupPose(side);
  const contact = liftBoot(computePose(contactEngine(side, 0.04)), side, 1);
  const follow = liftBoot(computePose(followEngine(side, 0.16)), side, 0.7);
  const settle = liftBoot(computePose(followEngine(side, 0.4)), side, 0.25);
  return [
    [0, idle],
    [0.16, wind],
    [0.26, lerpPose(wind, contact, 0.18)],
    [0.3, contact],
    [0.46, follow],
    [0.64, settle],
    [0.8, idle],
  ];
}

function missPose(time: number): Pose {
  const engine = freshEngine();
  engine.phase = 'dropped';
  engine.time = time;
  engine.lastDropTime = 0;
  return computePose(engine);
}

function celebratePose(time: number): Pose {
  const pose = idlePose(0);
  const up = time < 0.22 ? time / 0.22 : time > 1.0 ? Math.max(0, (1.2 - time) / 0.2) : 1;
  const hop = Math.sin(Math.min(time, 1.2) / 1.2 * Math.PI);
  pose.armLeft = lerp(0.22, 2.65, up);
  pose.armRight = lerp(0.22, 2.65, up);
  pose.elbowLeft = 0.35 * up;
  pose.elbowRight = 0.35 * up;
  pose.bodyY = 0.07 * hop;
  pose.headPitch = -0.22 * up;
  pose.torsoPitch = -0.1 * up;
  pose.torsoYaw = Math.sin(time * 8) * 0.06 * up;
  return pose;
}

function sampleClip(samples: Array<[number, Pose]>, fps: number): { times: Float32Array; poses: Pose[] } {
  const end = samples[samples.length - 1][0];
  const frames = Math.round(end * fps);
  const times = new Float32Array(frames + 1);
  const poses: Pose[] = [];
  for (let i = 0; i <= frames; i++) {
    const time = Math.min(end, i / fps);
    times[i] = time;
    let hi = 1;
    while (hi < samples.length && samples[hi][0] < time) hi++;
    const [t0, p0] = samples[Math.max(0, hi - 1)];
    const [t1, p1] = samples[Math.min(samples.length - 1, hi)];
    const span = t1 - t0;
    poses.push(span <= 1e-6 ? p1 : lerpPose(p0, p1, (time - t0) / span));
  }
  return { times, poses };
}

interface RigView {
  scene: Group;
  bones: Record<string, Group>;
  rest: Record<string, Quaternion>;
  hipsRest: Vector3;
}

function buildRig(doc: Awaited<ReturnType<NodeIO['read']>>): RigView {
  const root = doc.getRoot();
  const groups = new Map<Node, Group>();
  for (const node of root.listNodes()) {
    const group = new Group();
    group.name = node.getName();
    group.position.fromArray(node.getTranslation());
    group.quaternion.fromArray(node.getRotation());
    group.scale.fromArray(node.getScale());
    groups.set(node, group);
  }
  for (const node of root.listNodes()) {
    const group = groups.get(node)!;
    for (const child of node.listChildren()) group.add(groups.get(child)!);
  }
  const scene = new Group();
  for (const child of root.listScenes()[0].listChildren()) scene.add(groups.get(child)!);
  scene.updateMatrixWorld(true);
  const bones: Record<string, Group> = {};
  const rest: Record<string, Quaternion> = {};
  for (const key of POSE_KEYS) {
    const name = RENAME[KEY_TO_OLD[key]];
    const bone = scene.getObjectByName(name) as Group | undefined;
    if (!bone) throw new Error(`Missing posed bone ${name}`);
    bones[key] = bone;
    rest[key] = bone.quaternion.clone();
  }
  return { scene, bones, rest, hipsRest: bones.root.position.clone() };
}

function applyPose(rig: RigView, pose: Pose): void {
  const delta = new Quaternion();
  rig.scene.position.set(0, pose.bodyY, 0);
  for (const key of POSE_KEYS) {
    rig.bones[key].quaternion.copy(rig.rest[key]).multiply(ueDeltaQuaternion(key as never, pose, delta));
  }
  rig.bones.root.position.set(rig.hipsRest.x, rig.hipsRest.y + pose.bodyY, rig.hipsRest.z);
  rig.scene.updateMatrixWorld(true);
}

function writeClip(
  doc: Awaited<ReturnType<NodeIO['read']>>,
  name: string,
  times: Float32Array,
  poses: Pose[],
  rig: RigView,
): void {
  const root = doc.getRoot();
  const byName = new Map(root.listNodes().map((node) => [node.getName(), node]));
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor().setType('SCALAR').setArray(times).setBuffer(root.listBuffers()[0]);
  const tracks = new Map<string, { rotation: Float32Array; translation?: Float32Array }>();
  for (const key of POSE_KEYS) {
    tracks.set(key, { rotation: new Float32Array(poses.length * 4) });
  }
  tracks.get('root')!.translation = new Float32Array(poses.length * 3);
  for (let i = 0; i < poses.length; i++) {
    applyPose(rig, poses[i]);
    for (const key of POSE_KEYS) {
      const q = rig.bones[key].quaternion;
      const rot = tracks.get(key)!.rotation;
      rot.set([q.x, q.y, q.z, q.w], i * 4);
    }
    const p = rig.bones.root.position;
    tracks.get('root')!.translation!.set([p.x, p.y, p.z], i * 3);
  }
  // Restore bind so later clips sample from the rest pose.
  for (const key of POSE_KEYS) rig.bones[key].quaternion.copy(rig.rest[key]);
  rig.bones.root.position.copy(rig.hipsRest);

  for (const key of POSE_KEYS) {
    const node = byName.get(RENAME[KEY_TO_OLD[key]]);
    if (!node) throw new Error(`No node for ${key}`);
    const rotation = doc.createAccessor().setType('VEC4').setArray(tracks.get(key)!.rotation).setBuffer(root.listBuffers()[0]);
    const sampler = doc.createAnimationSampler().setInput(input).setOutput(rotation).setInterpolation('LINEAR');
    const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(node).setTargetPath('rotation');
    anim.addSampler(sampler).addChannel(channel);
  }
  const hips = byName.get('Hips');
  const translation = doc.createAccessor().setType('VEC3').setArray(tracks.get('root')!.translation!).setBuffer(root.listBuffers()[0]);
  const sampler = doc.createAnimationSampler().setInput(input).setOutput(translation).setInterpolation('LINEAR');
  const channel = doc.createAnimationChannel().setSampler(sampler).setTargetNode(hips!).setTargetPath('translation');
  anim.addSampler(sampler).addChannel(channel);
}

/** Extra lift so the modelled boot, not just the ankle, meets the ball. */
function liftBoot(pose: Pose, side: Side, amount: number): Pose {
  pose.legs[side].thigh -= 0.4 * amount;
  pose.legs[side].foot -= 0.6 * amount;
  pose.legs[side].abduct += (side === 'left' ? 0.15 : -0.15) * amount;
  return pose;
}

function assertContact(rig: RigView, side: Side): void {
  const idle = idlePose(0);
  applyPose(rig, idle);
  const footName = side === 'left' ? 'footLeft' : 'footRight';
  const toeName = side === 'left' ? 'Toe_L' : 'Toe_R';
  const restZ = rig.bones[footName].getWorldPosition(new Vector3()).z;
  applyPose(rig, liftBoot(computePose(contactEngine(side, 0.04)), side, 1));
  const foot = rig.bones[footName].getWorldPosition(new Vector3());
  const toe = rig.scene.getObjectByName(toeName)!.getWorldPosition(new Vector3());
  const sign = side === 'left' ? -1 : 1;
  const ball = new Vector3(sign * 0.17 * 0.6, 0.72, 0.62);
  const gap = toe.distanceTo(ball) - 0.14;
  console.log(side, 'foot Δz', (foot.z - restZ).toFixed(3), 'toe', toe.toArray().map((n) => +n.toFixed(3)), 'gap', +gap.toFixed(3));
  if (foot.z - restZ < 0.2) throw new Error(`${side} kick does not swing forward`);
  if (gap > 0.12) throw new Error(`${side} toe is ${gap.toFixed(3)}m from the ball surface`);
}

async function main(): Promise<void> {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const doc = await io.read(fileURLToPath(SRC));
  const root = doc.getRoot();
  const skin = root.listSkins()[0] as Skin;
  const oldJoints = skin.listJoints();
  const dropped = new Set(root.listNodes().filter((node) => isDropped(node.getName())));
  const newJoints = oldJoints.filter((joint) => !dropped.has(joint));
  const redirect = oldJoints.map((joint) => newJoints.indexOf(dropped.has(joint) ? keptAncestor(joint) : joint));

  let tris = 0;
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      retargetWeights(prim, redirect);
      const name = mesh.getName();
      if (name === 'Body') tris += await simplifyPrimitive(prim, 0.72);
      else if (name === 'Eyebrows') tris += await simplifyPrimitive(prim, 0.45);
      else tris += (prim.getIndices()?.getCount() ?? 0) / 3;
    }
  }
  console.log('triangles after simplify', tris);

  const ibm = skin.getInverseBindMatrices();
  const srcIbm = new Float32Array(ibm!.getArray()!);
  const dstIbm = new Float32Array(newJoints.length * 16);
  newJoints.forEach((joint, index) => {
    const old = oldJoints.indexOf(joint);
    dstIbm.set(srcIbm.subarray(old * 16, old * 16 + 16), index * 16);
  });
  for (const joint of [...oldJoints]) skin.removeJoint(joint);
  for (const joint of newJoints) skin.addJoint(joint);
  ibm!.setArray(dstIbm);

  for (const node of root.listNodes()) {
    if (!dropped.has(node)) continue;
    for (const child of [...node.listChildren()]) node.removeChild(child);
    node.getParentNode()?.removeChild(node);
  }
  for (const node of dropped) node.dispose();

  for (const node of root.listNodes()) {
    const next = RENAME[node.getName()];
    if (next) node.setName(next);
  }

  const shorts = root.listMaterials().find((material) => material.getName() === 'Shorts');
  if (shorts) shorts.setRoughnessFactor(0.72);
  await foldEyesIntoSkin(doc);
  await doc.transform(prune(), dedup({ propertyTypes: ['Accessor', 'Texture', 'Mesh'] }));

  const rig = buildRig(doc);
  const idle = sampleClip([[0, idlePose(0)], [1, idlePose(1)], [2, idlePose(2)]], 30);
  writeClip(doc, 'Idle', idle.times, idle.poses, rig);
  for (const side of ['left', 'right'] as const) {
    const clip = sampleClip(kickPoses(side), 30);
    writeClip(doc, side === 'left' ? 'KickLeft' : 'KickRight', clip.times, clip.poses, rig);
    assertContact(rig, side);
  }
  const miss = sampleClip([[0, missPose(0)], [0.35, missPose(0.35)], [1.5, missPose(1.5)]], 30);
  writeClip(doc, 'Miss', miss.times, miss.poses, rig);
  const celebrate = sampleClip([[0, celebratePose(0)], [0.3, celebratePose(0.3)], [0.7, celebratePose(0.7)], [1.2, celebratePose(1.2)]], 30);
  writeClip(doc, 'Celebrate', celebrate.times, celebrate.poses, rig);

  const jointCount = newJoints.length;
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(fileURLToPath(OUT), doc);

  const materials = root.listMaterials().map((m) => m.getName()).filter(Boolean);
  const bytes = readFileSync(OUT).length;
  console.log(JSON.stringify({
    bytes,
    joints: jointCount,
    triangles: tris,
    materials,
    clips: root.listAnimations().map((a) => a.getName()),
  }, null, 2));
  const required = ['Shirt', 'Shirt_Trim', 'Shorts', 'Socks', 'Boots', 'Boots_Sole', 'Skin', 'Hair'];
  for (const name of required) {
    if (!materials.includes(name)) throw new Error(`Missing material ${name}`);
  }
  if (materials.length > 8) throw new Error(`Too many materials: ${materials.join(', ')}`);
  if (jointCount > 40) throw new Error('Too many bones');
  if (tris >= 15000) throw new Error(`Too many triangles: ${tris}`);
  if (bytes > 1_500_000) throw new Error(`GLB is ${bytes} bytes`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
