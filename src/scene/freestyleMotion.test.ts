// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AnimationMixer, Bone, Object3D, Texture, Vector3, type AnimationClip, type Group } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GameEngine } from '../engine/engine';
import { applyContractBones } from './contractPose';
import { footTravel, pinAnkle } from './footIk';
import { createFreestyleRig, strikeAnkle, approachWeight } from './freestyleLayer';
import { BOOT_MATERIALS, THIGH_MATERIALS, UPPER_MATERIALS, closestSkinnedVertex, surfaceGap } from './measureFootContact';
import { createSecondaryMotion } from './secondaryMotion';
import { computePose } from './pose';
import { BONE_NAMES, EXTRA_BONE_NAMES, animationSampleTime, type AnimationState, type BoneKey } from './rig';

const MODEL = new URL('../../public/models/kickole_player_v4.glb', import.meta.url);

async function load(file: URL): Promise<{ scene: Group; animations: AnimationClip[] }> {
  (globalThis as { self?: typeof globalThis }).self ??= globalThis;
  await MeshoptDecoder.ready;
  const buf = readFileSync(file);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    loader.register(() => ({
      name: 'KHR_texture_basisu',
      loadTexture: () => Promise.resolve(new Texture()),
    }));
    loader.parse(ab, '', (gltf) => resolve(gltf as never), reject);
  });
}

function bone(scene: Group, name: string): Object3D {
  const found = scene.getObjectByName(name);
  if (!found) throw new Error(`missing ${name}`);
  return found;
}

function playingKick(side: 'left' | 'right', since: number) {
  const engine = new GameEngine();
  engine.phase = 'playing';
  engine.time = 3 + since;
  engine.lastKick.left = -10;
  engine.lastKick.right = -10;
  engine.lastContact.left = -10;
  engine.lastContact.right = -10;
  engine.lastKick[side] = 3;
  engine.ball.x = (side === 'left' ? -1 : 1) * engine.config.footX * 0.6;
  engine.ball.y = engine.config.contactHeight;
  engine.ball.z = engine.config.ballZ;
  engine.ball.vy = -0.4;
  return engine;
}

describe('freestyle phases', () => {
  it('eases the foot into the ball, follows through, and recovers without a position jump', () => {
    const start = new Vector3(0.13, 0.08, -0.07);
    const contact = new Vector3(0.1, 0.67, 0.31);
    const follow = new Vector3(0.12, 0.4, 0.55);
    const plant = start.clone();
    const out = new Vector3();
    let prev = strikeAnkle(0, start, contact, follow, plant, out).clone();
    expect(prev.distanceTo(start)).toBeLessThan(1e-6);
    let peak = 0;
    for (let step = 1; step <= 40; step++) {
      const since = step / 60;
      const next = strikeAnkle(since, start, contact, follow, plant, out).clone();
      peak = Math.max(peak, next.distanceTo(prev));
      prev = next;
    }
    // The 40 ms contact window still covers a long swing in a couple of frames.
    // Playback does not use this curve to start from the floor; the Fab clip is already chambered.
    expect(peak).toBeLessThan(0.45);
    strikeAnkle(0.04, start, contact, follow, plant, out);
    expect(out.distanceTo(contact)).toBeLessThan(1e-4);
    strikeAnkle(0.5, start, contact, follow, plant, out);
    expect(out.distanceTo(plant)).toBeLessThan(1e-4);
  });

  it('loads the body only while the ball is on the way down', () => {
    expect(approachWeight(0.1, true)).toBeGreaterThan(approachWeight(0.4, true));
    expect(approachWeight(0.2, false)).toBe(0);
    expect(approachWeight(1, true)).toBe(0);
  });

  it('lets hair and the kit lag a turn, then settle', () => {
    const motion = createSecondaryMotion();
    motion.step(1 / 60, { headYaw: 0, headPitch: 0, torsoRoll: 0, torsoPitch: 0 }, false);
    const flicked = motion.step(1 / 60, { headYaw: 0.4, headPitch: 0.2, torsoRoll: 0.3, torsoPitch: 0.2 }, false);
    expect(flicked.hairYaw).toBeLessThan(0);
    expect(flicked.kitRoll).toBeLessThan(0);
    let settled = flicked;
    for (let i = 0; i < 90; i++) {
      settled = motion.step(1 / 60, { headYaw: 0.4, headPitch: 0.2, torsoRoll: 0.3, torsoPitch: 0.2 }, false);
    }
    expect(Math.abs(settled.hairYaw)).toBeLessThan(0.02);
    expect(Math.abs(settled.kitRoll)).toBeLessThan(0.02);
  });

  it('rotates the hips through an around-the-world', () => {
    const engine = new GameEngine();
    engine.phase = 'playing';
    engine.time = 2;
    engine.trick = {
      kind: 'aroundTheWorld', phase: 'execute', side: 'left', startedAt: 1.7,
      awarded: false, revolution: 0.5, held: 0,
    };
    const pose = computePose(engine);
    expect(Math.abs(pose.bodyYaw)).toBeGreaterThan(0.4);
    expect(Math.sign(pose.torsoYaw)).toBe(-Math.sign(pose.bodyYaw));
  });
});

describe('fab foot contact', () => {
  it('keeps an ankle on a target when the hip is posed', async () => {
    const gltf = await load(MODEL);
    let thigh: import('three').Object3D | undefined;
    let shin: import('three').Object3D | undefined;
    let foot: import('three').Object3D | undefined;
    let toe: import('three').Object3D | undefined;
    gltf.scene.traverse((obj) => {
      if (obj.name === 'UpperLeg_L') thigh = obj;
      if (obj.name === 'LowerLeg_L') shin = obj;
      if (obj.name === 'Foot_L') foot = obj;
      if (obj.name === 'Toe_L') toe = obj;
    });
    if (!thigh || !shin || !foot) throw new Error('missing leg');
    gltf.scene.updateMatrixWorld(true);
    const target = foot.getWorldPosition(new Vector3());
    // A raised ankle forces the knee to bend. Matching the current ankle would pass with a no-op.
    target.y += 0.05;
    const error = pinAnkle(thigh, shin, foot, toe, target.clone());
    gltf.scene.updateMatrixWorld(true);
    const after = foot.getWorldPosition(new Vector3());
    expect(error).toBeLessThan(0.01);
    expect(after.distanceTo(target)).toBeLessThan(0.01);
  });

  it('plants the standing foot and seats the boot on the ball', async () => {
    const gltf = await load(MODEL);
    const rig = createFreestyleRig();
    expect(rig.measure(gltf.scene, gltf.animations)).toBe(true);
    const supportName = 'Foot_L';
    const strikeName = 'Foot_R';
    const clip = gltf.animations.find((entry) => entry.name === 'KickRight');
    if (!clip) throw new Error('missing KickRight');

    const raw: Vector3[] = [];
    const rawMixer = new AnimationMixer(gltf.scene);
    const rawAction = rawMixer.clipAction(clip);
    rawAction.play();
    rawAction.paused = true;
    rawAction.time = 0;
    rawMixer.update(0);
    for (let frame = 0; frame <= 27; frame++) {
      rawAction.time = Math.min(clip.duration, frame / 30);
      rawMixer.update(0);
      gltf.scene.updateMatrixWorld(true);
      raw.push(bone(gltf.scene, supportName).getWorldPosition(new Vector3()));
    }
    rawMixer.stopAllAction();
    const authored = footTravel(raw);

    const planted: Vector3[] = [];
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.time = 0;
    mixer.update(0);
    for (let frame = 0; frame <= 36; frame++) {
      const since = frame / 60;
      const engine = playingKick('right', since);
      const state: AnimationState = since < 0.35 ? 'KickRight' : 'Idle';
      action.time = state === 'KickRight' ? animationSampleTime(engine, state, clip.duration) : 0;
      mixer.update(1 / 60);
      rig.apply(engine, state, computePose(engine), 1 / 60);
      gltf.scene.updateMatrixWorld(true);
      planted.push(bone(gltf.scene, supportName).getWorldPosition(new Vector3()));
    }
    const contact = playingKick('right', 0.04);
    action.time = animationSampleTime(contact, 'KickRight', clip.duration);
    mixer.update(1 / 60);
    rig.apply(contact, 'KickRight', computePose(contact), 1 / 60);
    gltf.scene.updateMatrixWorld(true);
    const strikeFoot = bone(gltf.scene, strikeName).getWorldPosition(new Vector3());
    const centre = new Vector3(contact.ball.x, contact.ball.y, contact.ball.z);
    const bootGap = surfaceGap(gltf.scene, centre, contact.config.ballRadius, BOOT_MATERIALS, strikeFoot, 0.45);
    const corrected = footTravel(planted);
    const plant = rig.anchors.left.plant;
    let worst = 0;
    let worstAt = 0;
    planted.forEach((p, index) => {
      const distance = p.distanceTo(plant);
      if (distance > worst) { worst = distance; worstAt = index; }
    });
    expect(worst, `frame ${worstAt} foot ${planted[worstAt].toArray().map((n) => n.toFixed(3)).join(',')} plant ${plant.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.01);
    expect(authored.slide).toBeGreaterThan(corrected.slide);
    expect(corrected.slide).toBeLessThan(0.01);
    expect(corrected.bob).toBeLessThan(0.012);
    expect(Math.abs(bootGap), `boot gap ${bootGap.toFixed(3)} foot ${strikeFoot.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.02);

    const idleSamples: Array<{ x: number; y: number; z: number }> = [];
    const idle = gltf.animations.find((entry) => entry.name === 'Idle');
    if (!idle) throw new Error('missing Idle');
    const idleMixer = new AnimationMixer(gltf.scene);
    const idleAction = idleMixer.clipAction(idle);
    idleAction.play();
    idleAction.paused = true;
    idleAction.time = 0;
    idleMixer.update(0);
    const engine = new GameEngine();
    engine.phase = 'menu';
    for (let frame = 0; frame <= 120; frame++) {
      engine.time = frame / 60;
      idleAction.time = engine.time % idle.duration;
      idleMixer.update(1 / 60);
      rig.apply(engine, 'Idle', computePose(engine), 1 / 60);
      gltf.scene.updateMatrixWorld(true);
      idleSamples.push(bone(gltf.scene, 'Foot_L').getWorldPosition(new Vector3()));
      idleSamples.push(bone(gltf.scene, 'Foot_R').getWorldPosition(new Vector3()));
    }
    const left = footTravel(idleSamples.filter((_, index) => index % 2 === 0));
    const right = footTravel(idleSamples.filter((_, index) => index % 2 === 1));
    expect(left.slide).toBeLessThan(0.01);
    expect(right.slide).toBeLessThan(0.01);
    expect(left.bob).toBeLessThan(0.012);
    expect(right.bob).toBeLessThan(0.012);
  });

  it('seats the boot, upper back, mid-thigh, forehead and ATW instep on the ball', async () => {
    const gltf = await load(MODEL);
    const rig = createFreestyleRig();
    expect(rig.measure(gltf.scene, gltf.animations)).toBe(true);
    const bones: Partial<Record<BoneKey, Bone>> = {};
    const names: Record<string, string> = { ...BONE_NAMES, ...EXTRA_BONE_NAMES };
    for (const [key, name] of Object.entries(names)) {
      const found = gltf.scene.getObjectByName(name);
      if (found) bones[key as BoneKey] = found as Bone;
    }
    const hipsRestY = bones.root?.position.y ?? 0;
    const show = (engine: GameEngine) => {
      const pose = computePose(engine);
      applyContractBones(bones, pose, hipsRestY);
      rig.apply(engine, 'Idle', pose, 1 / 60);
      gltf.scene.updateMatrixWorld(true);
      return pose;
    };
    const centreOf = (engine: GameEngine) => new Vector3(engine.ball.x, engine.ball.y, engine.ball.z);
    const absGap = (engine: GameEngine, materials: Set<string>, near: Vector3, radius: number) => {
      const gap = surfaceGap(gltf.scene, centreOf(engine), engine.config.ballRadius, materials, near, radius);
      return gap;
    };

    const leftKick = playingKick('left', 0.04);
    const leftClip = gltf.animations.find((entry) => entry.name === 'KickLeft');
    if (!leftClip) throw new Error('missing KickLeft');
    const leftMixer = new AnimationMixer(gltf.scene);
    const leftAction = leftMixer.clipAction(leftClip);
    leftAction.play();
    leftAction.paused = true;
    leftAction.time = animationSampleTime(leftKick, 'KickLeft', leftClip.duration);
    leftMixer.update(1 / 60);
    rig.apply(leftKick, 'KickLeft', computePose(leftKick), 1 / 60);
    gltf.scene.updateMatrixWorld(true);
    const leftFoot = bone(gltf.scene, 'Foot_L').getWorldPosition(new Vector3());
    const leftGap = absGap(leftKick, BOOT_MATERIALS, leftFoot, 0.45);
    expect(Math.abs(leftGap), `left boot ${leftGap.toFixed(3)}`).toBeLessThan(0.02);

    const engine = new GameEngine();
    engine.phase = 'playing';
    engine.time = 2.2;
    engine.trick = {
      kind: 'neckStall', phase: 'execute', side: null, startedAt: 2,
      awarded: true, revolution: 0, held: 0.2,
    };
    engine.ball.x = 0;
    engine.ball.y = engine.config.contacts.nape.y;
    engine.ball.z = engine.config.contacts.nape.z;
    show(engine);
    const head = bone(gltf.scene, 'Head').getWorldPosition(new Vector3());
    const backProbe = bone(gltf.scene, 'Spine2').getWorldPosition(new Vector3());
    backProbe.y += 0.06;
    backProbe.z -= 0.05;
    const backGap = absGap(engine, UPPER_MATERIALS, backProbe, 0.36);
    const backHit = closestSkinnedVertex(gltf.scene, centreOf(engine), UPPER_MATERIALS, backProbe, 0.36);
    expect(Math.abs(backGap), `upper back ${backGap.toFixed(3)} head ${head.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.02);
    expect(head.z, 'the stall sits behind the head').toBeGreaterThan(engine.ball.z + engine.config.ballRadius * 0.4);
    expect(backHit && backHit.z < head.z, 'the near leather is the back, not the face').toBe(true);

    engine.trick = {
      kind: 'thigh', phase: 'contact', side: 'right', startedAt: 2,
      awarded: false, revolution: 0, held: 0,
    };
    engine.contact = {
      kind: 'stall', side: 'right', grade: 'good', deltaMs: 0, held: 0.1,
      highFlick: false, kickPower: 0, thigh: true,
    };
    engine.ball.x = engine.config.footX * 0.55;
    engine.ball.y = engine.config.contacts.thigh.y;
    engine.ball.z = engine.config.contacts.thigh.z;
    show(engine);
    const hip = bone(gltf.scene, 'UpperLeg_R').getWorldPosition(new Vector3());
    const knee = bone(gltf.scene, 'LowerLeg_R').getWorldPosition(new Vector3());
    const mid = hip.clone().lerp(knee, 0.45);
    const thighGap = absGap(engine, THIGH_MATERIALS, mid, 0.2);
    const thighHit = closestSkinnedVertex(gltf.scene, centreOf(engine), THIGH_MATERIALS, mid, 0.2);
    expect(Math.abs(thighGap), `mid-thigh ${thighGap.toFixed(3)} hip ${hip.toArray().map((n) => n.toFixed(3)).join(',')} knee ${knee.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.02);
    if (!thighHit) throw new Error('missing thigh vertex');
    const along = thighHit.clone().sub(hip).dot(knee.clone().sub(hip)) / Math.max(1e-6, knee.distanceToSquared(hip));
    expect(along, 'contact is on the mid-thigh, not the knee or the hip').toBeGreaterThan(0.2);
    expect(along).toBeLessThan(0.7);

    engine.contact = null;
    engine.trick = {
      kind: 'header', phase: 'contact', side: null, startedAt: 2.1,
      awarded: false, revolution: 0, held: 0,
    };
    engine.ball.x = 0;
    engine.ball.y = engine.config.contacts.forehead.y;
    engine.ball.z = engine.config.contacts.forehead.z;
    show(engine);
    const brow = bone(gltf.scene, 'Head').getWorldPosition(new Vector3());
    brow.y += 0.06;
    brow.z += 0.08;
    const headGap = absGap(engine, UPPER_MATERIALS, brow, 0.18);
    expect(Math.abs(headGap), `forehead ${headGap.toFixed(3)}`).toBeLessThan(0.02);

    engine.trick = {
      kind: 'aroundTheWorld', phase: 'execute', side: 'left', startedAt: 1.4,
      awarded: false, revolution: 0.35, held: 0,
    };
    engine.ball.x = -engine.config.atwHoverX;
    engine.ball.y = engine.config.atwHoverY;
    engine.ball.z = engine.config.atwHoverZ;
    const atwPose = show(engine);
    const atwFoot = bone(gltf.scene, 'Foot_L').getWorldPosition(new Vector3());
    const atwGap = absGap(engine, BOOT_MATERIALS, atwFoot, 0.45);
    const clearance = supportClearance(gltf.scene, 'left');
    expect(Math.abs(atwGap), `atw boot ${atwGap.toFixed(3)}`).toBeLessThan(0.02);
    expect(clearance, 'circling foot stays off the standing leg').toBeGreaterThan(0.04);
    expect(Math.abs(atwPose.bodyYaw)).toBeGreaterThan(0.4);

    engine.trick = {
      kind: 'highFlick', phase: 'execute', side: 'right', startedAt: 2,
      awarded: false, revolution: 0, held: 0,
    };
    engine.time = 2.05;
    engine.lastKick.right = 2;
    engine.ball.x = engine.config.footX * 0.6;
    engine.ball.y = engine.config.contactHeight;
    engine.ball.z = engine.config.ballZ;
    show(engine);
    const flickFoot = bone(gltf.scene, 'Foot_R').getWorldPosition(new Vector3());
    const flickGap = absGap(engine, BOOT_MATERIALS, flickFoot, 0.45);
    expect(Math.abs(flickGap), `flick boot ${flickGap.toFixed(3)}`).toBeLessThan(0.02);
    const contactAnkleY = flickFoot.y;
    engine.time = 2.2;
    engine.ball.y = engine.config.contactHeight + 0.45;
    show(engine);
    const risen = bone(gltf.scene, 'Foot_R').getWorldPosition(new Vector3());
    expect(risen.y, 'the flick carries the foot up after the touch').toBeGreaterThan(contactAnkleY + 0.25);

    engine.trick = {
      kind: 'groove', phase: 'execute', side: null, startedAt: 1.2,
      awarded: true, revolution: 0, held: 0,
    };
    engine.equippedDance = 'shuffle';
    engine.celebration = null;
    show(engine);
    expect(bone(gltf.scene, 'Foot_L').getWorldPosition(new Vector3()).distanceTo(rig.anchors.left.plant)).toBeLessThan(0.012);
    expect(bone(gltf.scene, 'Foot_R').getWorldPosition(new Vector3()).distanceTo(rig.anchors.right.plant)).toBeLessThan(0.012);
    engine.trick = null;
    engine.celebration = { danceId: 'heelrock', reason: 'test', startedAt: 1, until: 9 };
    engine.beatPhase = 0.4;
    show(engine);
    expect(bone(gltf.scene, 'Foot_L').getWorldPosition(new Vector3()).distanceTo(rig.anchors.left.plant)).toBeLessThan(0.012);
    expect(bone(gltf.scene, 'Foot_R').getWorldPosition(new Vector3()).distanceTo(rig.anchors.right.plant)).toBeLessThan(0.012);
  });
});

function supportClearance(scene: Group, circling: 'left' | 'right'): number {
  const suffix = circling === 'left' ? 'L' : 'R';
  const other = circling === 'left' ? 'R' : 'L';
  const points = ['LowerLeg_', 'Foot_', 'Toe_'].map((name) => bone(scene, `${name}${suffix}`).getWorldPosition(new Vector3()));
  const hip = bone(scene, `UpperLeg_${other}`).getWorldPosition(new Vector3());
  const knee = bone(scene, `LowerLeg_${other}`).getWorldPosition(new Vector3());
  const ankle = bone(scene, `Foot_${other}`).getWorldPosition(new Vector3());
  let closest = Number.POSITIVE_INFINITY;
  for (const point of points) {
    closest = Math.min(closest, segmentDistance(point, hip, knee), segmentDistance(point, knee, ankle));
  }
  return closest;
}

function segmentDistance(point: Vector3, a: Vector3, b: Vector3): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abz = b.z - a.z;
  const lenSq = abx * abx + aby * aby + abz * abz;
  if (lenSq < 1e-8) return point.distanceTo(a);
  const t = Math.min(1, Math.max(0, ((point.x - a.x) * abx + (point.y - a.y) * aby + (point.z - a.z) * abz) / lenSq));
  return point.distanceTo(new Vector3(a.x + abx * t, a.y + aby * t, a.z + abz * t));
}
