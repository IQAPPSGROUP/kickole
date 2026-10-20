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

  it('plants the standing foot and puts the striking ankle on a shifted ball', async () => {
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
    const strikeErrors: number[] = [];
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;
    action.time = 0;
    mixer.update(0);
    const shifted = 0.06;
    for (let frame = 0; frame <= 36; frame++) {
      const since = frame / 60;
      const engine = playingKick('right', since);
      engine.ball.x += shifted;
      const state: AnimationState = since < 0.35 ? 'KickRight' : 'Idle';
      action.time = state === 'KickRight' ? animationSampleTime(engine, state, clip.duration) : 0;
      mixer.update(1 / 60);
      rig.apply(engine, state, computePose(engine), 1 / 60);
      gltf.scene.updateMatrixWorld(true);
      planted.push(bone(gltf.scene, supportName).getWorldPosition(new Vector3()));
      if (Math.abs(since - 0.04) < 1 / 120) {
        const ankle = bone(gltf.scene, strikeName).getWorldPosition(new Vector3());
        const goal = rig.anchors.right.contact.clone();
        goal.x += shifted;
        strikeErrors.push(ankle.distanceTo(goal));
      }
    }
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
    expect(strikeErrors.length).toBeGreaterThan(0);
    expect(Math.min(...strikeErrors)).toBeLessThan(0.02);

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

  it('brings the nape, thigh and ATW hips up to the ball', async () => {
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
    const neck = bones.neck;
    const thigh = bones.thighRight;
    if (!neck || !thigh || !bones.root) throw new Error('missing bones');

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
    const pose = computePose(engine);
    applyContractBones(bones, pose, hipsRestY);
    rig.apply(engine, 'Idle', pose, 1 / 60);
    gltf.scene.updateMatrixWorld(true);
    const nape = neck.localToWorld(new Vector3(0, 0.06, -0.1));
    const neckGap = nape.distanceTo(new Vector3(engine.ball.x, engine.ball.y, engine.ball.z));

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
    const thighPose = computePose(engine);
    applyContractBones(bones, thighPose, hipsRestY);
    rig.apply(engine, 'Idle', thighPose, 1 / 60);
    gltf.scene.updateMatrixWorld(true);
    const pad = thigh.localToWorld(new Vector3(0, -0.4, 0.06));
    const hip = thigh.getWorldPosition(new Vector3());
    const thighGap = pad.distanceTo(new Vector3(engine.ball.x, engine.ball.y, engine.ball.z));

    engine.contact = null;
    engine.trick = {
      kind: 'aroundTheWorld', phase: 'execute', side: 'left', startedAt: 1.4,
      awarded: false, revolution: 0.5, held: 0,
    };
    const atwPose = computePose(engine);
    applyContractBones(bones, atwPose, hipsRestY);
    rig.apply(engine, 'Idle', atwPose, 1 / 60);
    gltf.scene.updateMatrixWorld(true);

    expect(neckGap, `nape ${nape.toArray().map((n) => n.toFixed(3)).join(',')} thighGap ${thighGap.toFixed(3)} pad ${pad.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.16);
    expect(thighGap, `thigh ${pad.toArray().map((n) => n.toFixed(3)).join(',')} hip ${hip.toArray().map((n) => n.toFixed(3)).join(',')}`).toBeLessThan(0.16);
    expect(Math.abs(atwPose.bodyYaw)).toBeGreaterThan(0.4);
  });
});
