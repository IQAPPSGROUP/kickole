// Development-only comparison, using the actual game character renderers and real kick/stall/trick replays.
import { Suspense, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Group, Vector3 } from 'three';
import { GameEngine } from '../src/engine/engine';
import { SKINS } from '../src/game/skins';
import { GlbCharacter } from '../src/scene/GlbCharacter';
import { Character } from '../src/scene/Character';
import { buildScenario } from '../src/scene/inspector';
import { computePlayerMotion } from '../src/scene/motion';
import { computePose } from '../src/scene/pose';
import { CHARACTER_MODEL_URL, UE_BONE_NAMES, rigKind } from '../src/scene/rig';

const scenarios = {
  idle: 'Relaxed idle',
  ready: 'Ready bounce',
  left: 'Left touch',
  right: 'Right touch',
  stall: 'Foot-stall balance',
  fist: 'One-arm pump',
  shimmy: 'Shoulder shimmy',
  salute: 'Two-hand salute',
  miss: 'Miss & recovery',
  headerOk: 'Header success',
  headerFail: 'Header mistimed',
  neckHold: 'Neck stall hold',
  neckRelease: 'Neck stall release',
  atwLeft: 'ATW left (circle)',
  atwRight: 'ATW right (circle)',
  atwFail: 'ATW early return fail',
  thighLeft: 'Thigh left',
  thighRight: 'Thigh right',
  flickLeft: 'High flick left',
  flickRight: 'High flick right',
} as const;
type Scenario = keyof typeof scenarios;
const review = {
  ready: false, error: '', scenario: 'idle', time: 0, motion: '', poseLock: false, renderer: 'glb',
  modelUrl: CHARACTER_MODEL_URL, rig: '', clips: 0,
  joints: { base: [] as number[], expressive: [] as number[] },
  set: (_: any) => {}, sample: () => ({}),
};
(window as any).__movementReview = review;
const state = { scenario: 'idle' as Scenario, time: 0, playing: true, renderer: 'glb' };

function stage(e: GameEngine, scenario: Scenario, t: number) {
  if (scenario === 'left' || scenario === 'right' || scenario === 'stall') {
    buildScenario(e, scenario === 'right' ? 'right' : 'left', scenario === 'stall' ? 'stall' : 'kick', t % 1.25 - .10);
    return;
  }
  e.prepare('menu'); e.time = 10 + t;
  if (scenario === 'ready') e.phase = 'ready';
  if (scenario === 'fist' || scenario === 'shimmy' || scenario === 'salute') {
    const age = t % 1.18 + .01; e.phase = 'playing'; e.stats.kickUps = { fist: 0, shimmy: 1, salute: 2 }[scenario];
    e.lastPerfectTime = e.time - .35 - age; e.lastKick.left = e.time - .39 - age;
    e.ball.y = 1.25 + Math.sin(age * Math.PI) * .6; e.ball.x = .10;
  }
  if (scenario === 'miss') { e.phase = 'dropped'; e.lastDropTime = e.time - (t % 1.7); e.ball.y = .09; e.ball.x = .4; }

  if (scenario === 'headerOk') {
    e.phase = 'playing';
    const age = t % 1.1;
    if (age < 0.35) {
      e.selectedTrick = 'header';
      e.ball.y = e.config.contacts.forehead.y + 0.55 - age * 1.2;
      e.ball.vy = -1.5; e.ball.z = e.config.contacts.forehead.z; e.ball.x = 0;
    } else {
      e.selectedTrick = null;
      e.trick = { kind: 'header', phase: age < 0.55 ? 'execute' : 'recover', side: null, startedAt: e.time - (age - 0.35), awarded: true, revolution: 0, held: 0 };
      e.lastTrick = { kind: 'header', time: e.time - (age - 0.35) };
      e.ball.y = e.config.contacts.forehead.y; e.ball.z = e.config.contacts.forehead.z;
      if (age > 0.55) { e.ball.vy = -0.8; e.ball.y = e.config.contacts.forehead.y - (age - 0.55) * 1.5; }
    }
  }
  if (scenario === 'headerFail') {
    e.phase = 'playing'; e.selectedTrick = 'header';
    e.ball.y = e.config.contacts.forehead.y + 1.1; e.ball.vy = 0; e.ball.z = e.config.contacts.forehead.z;
  }
  if (scenario === 'neckHold' || scenario === 'neckRelease') {
    e.phase = 'playing';
    const held = scenario === 'neckHold' ? 0.2 + (t % 0.8) : 0.9;
    e.trick = { kind: 'neckStall', phase: scenario === 'neckHold' ? 'execute' : 'recover', side: null, startedAt: e.time - held, awarded: true, revolution: 0, held };
    e.ball.x = 0; e.ball.y = e.config.contacts.nape.y; e.ball.z = e.config.contacts.nape.z;
    if (scenario === 'neckRelease') { e.ball.vy = 4.5; e.ball.y += (t % 0.7) * 1.2; }
  }
  if (scenario === 'atwLeft' || scenario === 'atwRight') {
    e.phase = 'playing';
    const side = scenario === 'atwLeft' ? 'left' : 'right';
    const rev = (t % 1.2) / 1.2;
    e.trick = { kind: 'aroundTheWorld', phase: rev < 1 ? 'execute' : 'recover', side, startedAt: e.time - rev * e.config.tricks.atwRevolutionTime, awarded: false, revolution: Math.min(1, rev), held: 0 };
    e.ball.y = e.config.contactHeight + 0.55; e.ball.vy = 0.2; e.ball.z = e.config.ballZ;
    e.ball.x = (side === 'left' ? -1 : 1) * 0.08;
  }
  if (scenario === 'atwFail') {
    e.phase = 'playing';
    e.trick = { kind: 'aroundTheWorld', phase: 'execute', side: 'left', startedAt: e.time - 0.2, awarded: false, revolution: 0.35, held: 0 };
    e.ball.y = e.config.contactHeight + 0.4; e.ball.z = e.config.ballZ;
  }
  if (scenario === 'thighLeft' || scenario === 'thighRight') {
    e.phase = 'playing';
    const side = scenario === 'thighLeft' ? 'left' : 'right';
    const age = t % 0.9;
    e.trick = { kind: 'thigh', phase: 'contact', side, startedAt: e.time - age, awarded: false, revolution: 0, held: age };
    e.contact = { kind: 'pending', side, grade: 'perfect', deltaMs: 0, held: age, highFlick: false, thigh: true };
    e.ball.y = e.config.contacts.thigh.y; e.ball.z = e.config.contacts.thigh.z;
    e.ball.x = (side === 'left' ? -1 : 1) * e.config.footX * 0.45;
  }
  if (scenario === 'flickLeft' || scenario === 'flickRight') {
    const side = scenario === 'flickLeft' ? 'left' : 'right';
    buildScenario(e, side, 'kick', Math.min(0.35, t % 0.9));
    e.stats.highFlicks = 1;
    e.lastTrick = { kind: 'highFlick', time: e.lastContact[side] };
    if (e.contact) e.contact.highFlick = true;
    if (!e.contact && e.ball.vy > 0) e.ball.vy = Math.max(e.ball.vy, 7.2);
  }
}

function Driver({ engine }: { engine: GameEngine }) {
  useFrame((_, dt) => {
    if (state.playing) state.time += Math.min(dt, .05);
    stage(engine, state.scenario, state.time);
    review.time = state.time;
    review.motion = computePlayerMotion(engine).name;
    review.poseLock = computePose(engine).lockMotion;
  }, -2);
  return null;
}

function ReviewBall({ engine }: { engine: GameEngine }) {
  const position = useMemo(() => new Vector3(), []);
  const [mesh, setMesh] = useState<any>(null);
  useFrame(() => {
    if (mesh) {
      position.set(engine.ball.x, engine.ball.y, engine.ball.z);
      mesh.position.copy(position);
      mesh.visible = !['fist', 'shimmy', 'salute'].includes(state.scenario);
    }
  });
  return <mesh ref={setMesh}><sphereGeometry args={[engine.config.ballRadius, 24, 16]} /><meshStandardMaterial color="#fff8df" roughness={.5} /></mesh>;
}

function App() {
  const [scenario, setScenario] = useState<Scenario>('idle');
  const [playing, setPlaying] = useState(true);
  const [renderer, setRenderer] = useState('glb');
  const engine = useMemo(() => new GameEngine(), []);
  const [time, setTime] = useState(0);
  useEffect(() => {
    review.set = (o: any) => {
      if (o.scenario) { state.scenario = o.scenario; setScenario(o.scenario); state.time = 0; }
      if (o.time !== undefined) { state.time = o.time; setTime(o.time); }
      if (o.playing !== undefined) { state.playing = o.playing; setPlaying(o.playing); }
      if (o.renderer) { state.renderer = o.renderer; setRenderer(o.renderer); }
      review.scenario = state.scenario; review.renderer = state.renderer;
    };
    const id = setInterval(() => setTime(state.time), 100);
    return () => clearInterval(id);
  }, []);
  return <>
    <div className="labels"><span>V2 BASE MOVEMENT</span><span>V2 EXPRESSIVE</span></div>
    <Canvas shadows camera={{ position: [2.6, 2.4, 7.2], fov: 37 }} onCreated={({ camera }) => camera.lookAt(0, 1.1, .0)}>
      <color attach="background" args={['#e9ddc4']} /><ambientLight intensity={1.2} /><hemisphereLight args={['#fff4dd', '#738b80', 1.4]} />
      <directionalLight position={[-3, 7, 5]} intensity={2.5} castShadow shadow-mapSize={[1024, 1024]} />
      <Driver engine={engine} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.012, 0]} receiveShadow><planeGeometry args={[100, 100]} /><meshStandardMaterial color="#c8b78d" roughness={1} /></mesh>
      <Suspense fallback={null}>
        {[false, true].map(expressive => <Actor key={`${expressive}-${renderer}`} engine={engine} expressive={expressive} renderer={renderer} />)}
      </Suspense>
    </Canvas>
    <div className="controls">
      <select aria-label="Movement" value={scenario} onChange={e => review.set({ scenario: e.target.value, playing: true })}>
        {Object.entries(scenarios).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
      <button onClick={() => review.set({ playing: !playing })}>{playing ? 'Pause' : 'Play'}</button>
      <input aria-label="Movement time" type="range" min="0" max="2" step=".01" value={time % 2} onChange={e => review.set({ time: Number(e.target.value), playing: false })} />
      <select aria-label="Character renderer" value={renderer} onChange={e => review.set({ renderer: e.target.value })}>
        <option value="glb">Quaternius v2 model</option>
        <option value="primitive">Primitive fallback</option>
      </select>
      <output>{scenarios[scenario]} · {(time % 2).toFixed(2)}s · lock={String(review.poseLock)}</output>
    </div>
  </>;
}

function Actor({ engine, expressive, renderer }: { engine: GameEngine; expressive: boolean; renderer: string }) {
  const group = useRef<Group>(null);
  return <group ref={group} position={[expressive ? 1.05 : -1.05, 0, 0]}>
    {renderer === 'glb'
      ? <GlbCharacter engine={engine} skin={SKINS[0]} expressive={expressive} onInvalid={() => { review.error = 'Character rig failed validation'; }} />
      : <Character engine={engine} skin={SKINS[0]} expressive={expressive} />}
    <ReviewBall engine={engine} /><Probe engine={engine} actor={group} expressive={expressive} />
  </group>;
}

function Probe({ engine, actor, expressive }: { engine: GameEngine; actor: RefObject<Group | null>; expressive: boolean }) {
  const gltf = useGLTF(CHARACTER_MODEL_URL);
  const point = useMemo(() => new Vector3(), []);
  const origin = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const group = actor.current; if (!group) return;
    group.updateWorldMatrix(true, true); group.getWorldPosition(origin); const joints: number[] = [];
    for (const key of ['head', 'armLeft', 'armRight', 'footLeft', 'footRight', 'root'] as const) {
      const joint = group.getObjectByName(key === 'armLeft' ? 'hand_r' : key === 'armRight' ? 'hand_l' : UE_BONE_NAMES[key]);
      if (joint) { joint.getWorldPosition(point).sub(origin); joints.push(point.x, point.y, point.z); }
    }
    review.joints[expressive ? 'expressive' : 'base'] = joints;
  });
  useEffect(() => {
    const names: string[] = []; gltf.scene.traverse(o => names.push(o.name));
    review.rig = rigKind(names); review.clips = gltf.animations.length; review.ready = true;
  }, [gltf]);
  review.sample = () => ({ phase: engine.phase, ball: { ...engine.ball }, motion: computePlayerMotion(engine), pose: computePose(engine) });
  return null;
}

createRoot(document.querySelector('#root')!).render(<App />);
