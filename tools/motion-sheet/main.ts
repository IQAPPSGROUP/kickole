import {
  AnimationMixer,
  CircleGeometry,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
  WebGLRenderer,
  type AnimationAction,
  type AnimationClip,
  type Bone,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GameEngine } from '../../src/engine/engine';
import { applyContractBones } from '../../src/scene/contractPose';
import { createFreestyleRig } from '../../src/scene/freestyleLayer';
import { computePose } from '../../src/scene/pose';
import {
  BONE_NAMES,
  EXTRA_BONE_NAMES,
  animationSampleTime,
  type AnimationState,
  type BoneKey,
} from '../../src/scene/rig';

const COLS = 6;
const CELL_W = 280;
const CELL_H = 320;
const LABEL_W = 132;
const HEADER = 36;

const sheet = document.querySelector<HTMLCanvasElement>('#sheet');
if (!sheet) throw new Error('missing sheet canvas');
const ctx = sheet.getContext('2d');
if (!ctx) throw new Error('missing 2d context');

const renderer = new WebGLRenderer({ antialias: true });
renderer.setSize(CELL_W, CELL_H - 22, false);
renderer.setPixelRatio(1);
renderer.setClearColor(0x241f1c, 1);

const scene = new Scene();
scene.add(new HemisphereLight(0xfff1df, 0x2c2824, 0.9));
const sun = new DirectionalLight(0xffffff, 1.45);
sun.position.set(1.2, 3.2, 2.4);
scene.add(sun);

const camera = new PerspectiveCamera(64, CELL_W / (CELL_H - 22), 0.05, 30);
// 1.5 m to the side, lens at knee height. Look slightly up so the head stays in frame.
camera.position.set(1.5, 0.5, 0.18);
camera.lookAt(0, 0.82, 0.18);

const ballMesh = new Mesh(
  new SphereGeometry(0.11, 28, 18),
  new MeshStandardMaterial({ color: 0xe36a1e, roughness: 0.4 }),
);
scene.add(ballMesh);

const ground = new Mesh(
  new CircleGeometry(1.6, 48),
  new MeshStandardMaterial({ color: 0x3d4a3c, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

function marker(color: number) {
  const mesh = new Mesh(
    new CylinderGeometry(0.012, 0.012, 0.22, 8),
    new MeshStandardMaterial({ color, roughness: 0.4 }),
  );
  mesh.position.y = 0.11;
  scene.add(mesh);
  return mesh;
}
const leftMark = marker(0x3dd6c6);
const rightMark = marker(0xf0c14a);

const rig = createFreestyleRig();
const mixer = new AnimationMixer(scene);
const actions = new Map<string, AnimationAction>();
const bindQ = new Map<Object3D, Quaternion>();
const bindP = new Map<Object3D, Vector3>();
let hipsRestY = 0.93;
let bones: Partial<Record<BoneKey, Bone>> = {};

function restoreBind() {
  for (const [bone, q] of bindQ) bone.quaternion.copy(q);
  for (const [bone, p] of bindP) bone.position.copy(p);
}

function placeBall(engine: GameEngine, visible: boolean) {
  ballMesh.visible = visible;
  ballMesh.position.set(engine.ball.x, engine.ball.y, engine.ball.z);
}

function fresh(phase: 'menu' | 'playing' = 'playing') {
  const engine = new GameEngine();
  engine.phase = phase;
  engine.time = 2;
  engine.trick = null;
  engine.celebration = null;
  engine.selectedTrick = null;
  engine.contact = null;
  engine.beatPhase = null;
  engine.reducedMotion = false;
  engine.lastKick.left = -10;
  engine.lastKick.right = -10;
  engine.lastContact.left = -10;
  engine.lastContact.right = -10;
  engine.ball.x = 0;
  engine.ball.z = engine.config.ballZ;
  engine.ball.vy = 0;
  return engine;
}

function playClip(state: AnimationState, engine: GameEngine) {
  const action = actions.get(state);
  if (!action) return;
  mixer.stopAllAction();
  action.reset().play();
  action.paused = true;
  action.setEffectiveWeight(1);
  action.time = animationSampleTime(engine, state, action.getClip().duration);
  mixer.update(1 / 60);
}

function showClip(state: AnimationState, engine: GameEngine) {
  restoreBind();
  playClip(state, engine);
  const pose = computePose(engine);
  rig.apply(engine, state, pose, 1 / 60);
}

function showPose(engine: GameEngine) {
  restoreBind();
  const pose = computePose(engine);
  applyContractBones(bones, pose, hipsRestY);
  rig.apply(engine, 'Idle', pose, 1 / 60);
}

interface Row {
  title: string;
  times: number[];
  step: (t: number) => void;
}

function idleRow(): Row {
  return {
    title: 'Idle',
    times: [0.15, 0.45, 0.8, 1.15, 1.5, 1.9],
    step(t) {
      const engine = fresh('menu');
      engine.time = t;
      showClip('Idle', engine);
      placeBall(engine, false);
    },
  };
}

function approachRow(): Row {
  const heights = [1.5, 1.25, 1.05, 0.9, 0.8, 0.73];
  return {
    title: 'Approach',
    times: [0, 1, 2, 3, 4, 5].map((i) => i / 60),
    step(t) {
      const index = Math.round(t * 60);
      const engine = fresh('playing');
      engine.time = 1 + t;
      engine.ball.y = heights[Math.min(heights.length - 1, index)] ?? 0.73;
      engine.ball.vy = -2.4;
      engine.ball.x = 0.02;
      showClip('Idle', engine);
      placeBall(engine, true);
    },
  };
}

function blendRow(): Row {
  let started = false;
  let idle: AnimationAction | undefined;
  let kick: AnimationAction | undefined;
  return {
    title: 'Into kick',
    times: [0, 0.04, 0.08, 0.12, 0.18, 0.3],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.lastKick.right = 2;
      engine.ball.x = engine.config.footX * 0.6;
      engine.ball.y = t < 0.04 ? 0.95 : engine.config.contactHeight;
      engine.ball.z = engine.config.ballZ;
      engine.ball.vy = t < 0.04 ? -2 : 0.2;
      if (!started) {
        restoreBind();
        mixer.stopAllAction();
        idle = actions.get('Idle');
        kick = actions.get('KickRight');
        if (!idle || !kick) return;
        idle.reset().play();
        kick.reset().play();
        idle.crossFadeTo(kick, 0.12, false);
        started = true;
      }
      if (!idle || !kick) return;
      idle.paused = true;
      kick.paused = true;
      idle.time = 0.35;
      kick.time = animationSampleTime(engine, 'KickRight', kick.getClip().duration);
      mixer.update(1 / 60);
      rig.apply(engine, 'KickRight', computePose(engine), 1 / 60);
      placeBall(engine, true);
    },
  };
}

function kickRow(side: 'left' | 'right'): Row {
  const state: AnimationState = side === 'left' ? 'KickLeft' : 'KickRight';
  const sign = side === 'left' ? -1 : 1;
  return {
    title: side === 'left' ? 'Kick left' : 'Kick right',
    times: [0, 0.02, 0.04, 0.1, 0.2, 0.36],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.lastKick[side] = 2;
      // The labelled 0.04 s cell is the contact frame: ball on the config point, no extra shift.
      engine.ball.x = sign * engine.config.footX * 0.6;
      engine.ball.y = t < 0.04 ? 0.92 - t * 4 : engine.config.contactHeight + Math.max(0, t - 0.04) * 1.4;
      engine.ball.z = engine.config.ballZ + (t > 0.04 ? (t - 0.04) * 0.4 : 0);
      engine.ball.vy = t < 0.04 ? -2 : 3;
      showClip(state, engine);
      placeBall(engine, true);
    },
  };
}

function neckRow(): Row {
  return {
    title: 'Neck',
    times: [0.02, 0.06, 0.12, 0.22, 0.35, 0.5],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.trick = {
        kind: 'neckStall', phase: 'execute', side: null, startedAt: 2,
        awarded: true, revolution: 0, held: t,
      };
      engine.ball.x = 0;
      engine.ball.y = engine.config.contacts.nape.y;
      engine.ball.z = engine.config.contacts.nape.z;
      showPose(engine);
      placeBall(engine, true);
    },
  };
}

function atwRow(): Row {
  return {
    title: 'ATW',
    times: [0.02, 0.2, 0.35, 0.55, 0.75, 0.95],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.trick = {
        kind: 'aroundTheWorld', phase: 'execute', side: 'left', startedAt: 1.4,
        awarded: false, revolution: t, held: 0,
      };
      engine.ball.x = -engine.config.atwHoverX;
      engine.ball.y = engine.config.atwHoverY;
      engine.ball.z = engine.config.atwHoverZ;
      showPose(engine);
      placeBall(engine, true);
    },
  };
}

function headerRow(): Row {
  return {
    title: 'Header',
    times: [0.02, 0.06, 0.1, 0.16, 0.24, 0.36],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.trick = {
        kind: 'header', phase: t < 0.12 ? 'contact' : 'recover', side: null, startedAt: 2,
        awarded: false, revolution: 0, held: 0,
      };
      engine.ball.x = 0;
      engine.ball.y = engine.config.contacts.forehead.y + Math.max(0, t - 0.1) * 1.2;
      engine.ball.z = engine.config.contacts.forehead.z;
      showPose(engine);
      placeBall(engine, true);
    },
  };
}

function thighRow(): Row {
  return {
    title: 'Thigh',
    times: [0.02, 0.06, 0.1, 0.16, 0.24, 0.34],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.trick = {
        kind: 'thigh', phase: 'contact', side: 'right', startedAt: 2,
        awarded: false, revolution: 0, held: 0,
      };
      engine.contact = {
        kind: 'stall', side: 'right', grade: 'good', deltaMs: 0, held: t,
        highFlick: false, kickPower: 0, thigh: true,
      };
      const c = engine.config.contacts.thigh;
      engine.ball.x = engine.config.footX * 0.55;
      engine.ball.y = c.y;
      engine.ball.z = c.z;
      showPose(engine);
      placeBall(engine, true);
    },
  };
}

function flickRow(): Row {
  return {
    title: 'Flick',
    times: [0, 0.05, 0.12, 0.2, 0.3, 0.42],
    step(t) {
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.lastKick.right = 2;
      engine.trick = {
        kind: 'highFlick', phase: 'execute', side: 'right', startedAt: 2,
        awarded: false, revolution: 0, held: 0,
      };
      engine.ball.x = engine.config.footX * 0.6;
      // Chamber and the underside touch share the contact point. After that the ball climbs.
      engine.ball.y = t <= 0.08 ? engine.config.contactHeight : engine.config.contactHeight + (t - 0.08) * 3.4;
      engine.ball.z = engine.config.ballZ + (t > 0.08 ? (t - 0.08) * 0.2 : 0);
      engine.ball.vy = t <= 0.08 ? -0.2 : 6;
      showPose(engine);
      placeBall(engine, true);
    },
  };
}

function danceRow(title: string, danceId: string): Row {
  const phases = [0.05, 0.2, 0.38, 0.55, 0.72, 0.9];
  return {
    title,
    times: [0, 1, 2, 3, 4, 5].map((i) => i / 60),
    step(t) {
      const index = Math.round(t * 60);
      const engine = fresh('playing');
      engine.time = 2 + t;
      engine.beatPhase = phases[index] ?? 0;
      engine.celebration = { danceId, reason: 'sheet', startedAt: 1, until: 9 };
      showPose(engine);
      placeBall(engine, false);
    },
  };
}

function grooveRow(): Row {
  const phases = [0.05, 0.22, 0.4, 0.55, 0.72, 0.9];
  return {
    title: 'Groove',
    times: [0, 1, 2, 3, 4, 5].map((i) => i / 60),
    step(t) {
      const index = Math.round(t * 60);
      const phase = phases[index] ?? 0;
      const engine = fresh('playing');
      engine.time = 3;
      engine.equippedDance = 'shuffle';
      engine.trick = {
        kind: 'groove', phase: 'execute', side: null,
        startedAt: engine.time - phase * engine.config.tricks.grooveDanceSec,
        awarded: true, revolution: 0, held: 0,
      };
      showPose(engine);
      placeBall(engine, false);
    },
  };
}

async function loadModel(): Promise<AnimationClip[]> {
  await MeshoptDecoder.ready;
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(`${import.meta.env.BASE_URL}decoders/basis/`);
  ktx2.detectSupport(renderer);
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.setKTX2Loader(ktx2);
  const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/kickole_player_v4.glb`);
  const clay = new MeshStandardMaterial({ color: 0xd7c4ae, roughness: 0.62, metalness: 0 });
  gltf.scene.traverse((obj) => {
    const mesh = obj as Mesh;
    if (!mesh.isMesh) return;
    mesh.material = clay;
    mesh.frustumCulled = false;
  });
  scene.add(gltf.scene);
  const names: Record<string, string> = { ...BONE_NAMES, ...EXTRA_BONE_NAMES };
  bones = {};
  for (const [key, name] of Object.entries(names)) {
    const bone = gltf.scene.getObjectByName(name);
    if (bone) bones[key as BoneKey] = bone as Bone;
  }
  gltf.scene.traverse((obj) => {
    const bone = obj as Bone;
    if (!bone.isBone) return;
    bindQ.set(bone, bone.quaternion.clone());
    bindP.set(bone, bone.position.clone());
  });
  hipsRestY = bones.root?.position.y ?? hipsRestY;
  if (!rig.measure(gltf.scene, gltf.animations)) throw new Error('freestyle rig did not bind');
  leftMark.position.x = rig.anchors.left.plant.x;
  leftMark.position.z = rig.anchors.left.plant.z;
  rightMark.position.x = rig.anchors.right.plant.x;
  rightMark.position.z = rig.anchors.right.plant.z;
  for (const clip of gltf.animations) actions.set(clip.name, mixer.clipAction(clip));
  return gltf.animations;
}

function paintRow(index: number, row: Row) {
  rig.reset();
  const samples = [...row.times].sort((a, b) => a - b);
  const y = HEADER + index * CELL_H;
  ctx.fillStyle = '#17191d';
  ctx.fillRect(0, y, sheet.width, CELL_H);
  ctx.fillStyle = '#f4f0e6';
  ctx.font = '600 15px sans-serif';
  ctx.fillText(row.title, 12, y + 28);
  let clock = 0;
  samples.forEach((t, col) => {
    // Advance crossfades on the frames between labels, then draw the exact time.
    while (clock + 1 / 60 < t - 1e-4) {
      clock += 1 / 60;
      row.step(clock);
    }
    row.step(t);
    clock = t;
    scene.updateMatrixWorld(true);
    renderer.render(scene, camera);
    const x = LABEL_W + col * CELL_W;
    ctx.drawImage(renderer.domElement, x, y + 22, CELL_W, CELL_H - 22);
    ctx.fillStyle = '#f4f0e6';
    ctx.font = '12px sans-serif';
    ctx.fillText(`${t.toFixed(2)}s`, x + 8, y + 16);
  });
}

async function main() {
  const rows: Row[] = [
    idleRow(),
    approachRow(),
    blendRow(),
    kickRow('right'),
    kickRow('left'),
    neckRow(),
    headerRow(),
    atwRow(),
    thighRow(),
    flickRow(),
    grooveRow(),
    danceRow('Heel rock', 'heelrock'),
  ];
  sheet.width = LABEL_W + COLS * CELL_W;
  sheet.height = HEADER + rows.length * CELL_H;
  ctx.fillStyle = '#17191d';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#f4f0e6';
  ctx.font = '600 16px sans-serif';
  ctx.fillText('Side view · camera 1.5 m at knee height (y = 0.50) · markers stay on the planted ankles', 12, 24);
  await loadModel();
  rows.forEach((row, index) => paintRow(index, row));
  document.body.dataset.ready = '1';
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  sheet.width = 900;
  sheet.height = 240;
  ctx.fillStyle = '#3a1515';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#ffd0d0';
  ctx.font = '14px sans-serif';
  message.split('\n').slice(0, 8).forEach((line, i) => ctx.fillText(line, 16, 32 + i * 20));
  document.body.dataset.ready = 'error';
});
