import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { ACESFilmicToneMapping, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GameController } from '../game/controller';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { sceneById, type GameScene, type SceneId } from '../game/scenes';
import { CharacterSwitch } from './CharacterSwitch';
import { Ball } from './Ball';
import { Beach } from './Beach';
import { Court } from './Court';
import { Effects } from './Effects';
import { celebrateOffset, milestonePush } from './camera-motion';
import { inspector } from './inspector';
import { fx } from './fx';

const TARGET = new Vector3(0, 1.25, 0.3);
const DIR = new Vector3(0.42, 0.38, 0.82).normalize();
const FOV = 40;

const BASE = new Vector3();
const LOOK = new Vector3();

/** Three-quarter front camera. Low still pushes and lifts; shake and the wider orbit start at Medium. */
function CameraRig({ quality }: { quality: Quality }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / size.height;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const dist = Math.max(2.55 / tan, 1.5 / (tan * aspect)) + 0.4;
    cam.fov = FOV;
    BASE.copy(TARGET).addScaledVector(DIR, dist);
    cam.position.copy(BASE);
    cam.lookAt(TARGET);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  useFrame((state, dt) => {
    const step = Math.min(dt, 0.05);
    fx.push = Math.max(0, fx.push - step * 2.2);
    fx.shake = Math.max(0, fx.shake - step * 4);
    fx.celebrate = Math.max(0, fx.celebrate - step * 0.42);
    fx.pulse = Math.max(0, fx.pulse - step * 1.7);
    fx.sway *= Math.exp(-step * 2.2);
    if (BASE.lengthSq() === 0) return;
    const t = state.clock.elapsedTime;
    const motion = celebrateOffset(fx.celebrate, t, quality);
    const milestone = fx.pulse * milestonePush(quality);
    const yaw = motion.yaw + fx.sway * (quality === 'low' ? 0.03 : 0.07);
    const offsetX = BASE.x - TARGET.x;
    const offsetZ = BASE.z - TARGET.z;
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const dolly = 1 - fx.push * (quality === 'low' ? 0.04 : 0.06) - motion.dolly - milestone * 0.06;
    camera.position.set(
      TARGET.x + (offsetX * c - offsetZ * s) * dolly,
      BASE.y + motion.lift + milestone * (quality === 'low' ? 0.02 : 0.05),
      TARGET.z + (offsetX * s + offsetZ * c) * dolly,
    );
    if (quality !== 'low') {
      camera.position.x += Math.sin(t * 55) * 0.02 * fx.shake;
      camera.position.y += Math.cos(t * 63) * 0.016 * fx.shake;
    }
    LOOK.set(TARGET.x, TARGET.y + motion.lift * 0.35, TARGET.z);
    camera.lookAt(LOOK);
  });
  return null;
}

/** Soft image-based lighting from a procedural room (no external HDR download). */
function Environment({ intensity }: { intensity: number }) {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = intensity;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene, intensity]);
  return null;
}

function Simulation({ controller }: { controller: GameController }) {
  useFrame((_, dt) => { if (!inspector.active) controller.tick(dt); });
  return null;
}

interface SceneProps {
  controller: GameController;
  skin: Skin;
  quality: Quality;
  sceneId: SceneId;
  onReady: () => void;
}

function Playground({ scene, shadows, quality }: { scene: GameScene; shadows: boolean; quality: Quality }) {
  switch (scene.id) {
    case 'beach':
      return <Beach shadows={shadows} quality={quality} />;
    case 'rua':
      return <Court shadows={shadows} quality={quality} />;
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
}

function SceneLights({ scene, quality }: { scene: GameScene; quality: Quality }) {
  switch (scene.id) {
    case 'beach':
      return (
        <>
          <directionalLight position={[-2.4, 5.2, 6]} intensity={0.55} color="#d5f3ff" />
          <pointLight position={[0.4, 0.6, -7]} intensity={quality === 'low' ? 1.4 : 3.2} color="#6ed4e6" distance={18} decay={2} />
          {quality !== 'low' && <pointLight position={[3.6, 2.4, 1.2]} intensity={1.5} color="#ffe1ad" distance={9} decay={2} />}
        </>
      );
    case 'rua':
      return (
        <>
          <directionalLight position={[-4.2, 3.4, 5.2]} intensity={0.55} color="#d7eeff" />
          <pointLight position={[-3.3, 3.4, -2.3]} intensity={quality === 'low' ? 4 : 8} color="#ffe2b0" distance={14} decay={2} />
          <pointLight position={[3.3, 3.4, -2.3]} intensity={quality === 'low' ? 3 : 6} color="#fff1d4" distance={13} decay={2} />
          {quality !== 'low' && <pointLight position={[0.2, 1.7, 2.8]} intensity={1.6} color="#9adfff" distance={8} decay={2} />}
          {quality === 'high' && <pointLight position={[2.2, 1.15, 0.2]} intensity={2.2} color="#ff8d62" distance={6} decay={2} />}
        </>
      );
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
}

function World({ controller, skin, quality, sceneId, onReady }: SceneProps) {
  const shadows = quality !== 'low';
  const scene = sceneById(sceneId);
  useEffect(() => { onReady(); }, [onReady]);
  const mapSize = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <color key={scene.id} attach="background" args={[scene.sky]} />
      <fog key={`${scene.id}-fog`} attach="fog" args={[scene.sky, scene.fogNear, scene.fogFar]} />
      <CameraRig quality={quality} />
      {quality === 'high' && <Environment intensity={scene.id === 'rua' ? 0.55 : 0.38} />}
      <Simulation controller={controller} />
      <hemisphereLight args={[scene.hemiSky, scene.hemiGround, scene.hemi]} />
      <ambientLight intensity={scene.ambient} />
      <directionalLight
        position={scene.sunPosition}
        intensity={scene.sunIntensity}
        color={scene.sun}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-4.6}
        shadow-camera-right={4.6}
        shadow-camera-top={4.6}
        shadow-camera-bottom={-4.4}
        shadow-camera-near={0.5}
        shadow-camera-far={16}
        shadow-bias={-0.00035}
        shadow-normalBias={0.025}
        shadow-radius={quality === 'high' ? 2.5 : 1.5}
      />
      <SceneLights scene={scene} quality={quality} />
      <Playground scene={scene} shadows={shadows} quality={quality} />
      {shadows && quality === 'high' && (
        <ContactShadows position={[0, 0.006, 0.2]} opacity={0.35} scale={4} blur={2.4} far={1.2} resolution={256} color={scene.shadow} />
      )}
      <CharacterSwitch engine={controller.engine} skin={skin} />
      <Ball engine={controller.engine} skin={skin} quality={quality} />
      <Effects engine={controller.engine} quality={quality} />
    </>
  );
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class Boundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn('3D scene failed', err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function GlError({ message }: { message: string }) {
  return (
    <div className="gl-error">
      <h2>Can't start 3D graphics</h2>
      <p>{message}</p>
      <button className="btn primary" onClick={() => location.reload()}>RELOAD</button>
    </div>
  );
}

export function GameCanvas(props: Omit<SceneProps, 'onReady'>) {
  const [supported] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;
  if (lost) return <GlError message="The graphics context was lost. Reload to continue." />;

  const dpr: [number, number] = props.quality === 'low' ? [1, 1] : props.quality === 'medium' ? [1, 1.5] : [1, 2];
  return (
    <Boundary fallback={<GlError message="Something went wrong while drawing the game." />}>
      {!ready && <div className="loading"><div className="spinner" />Loading…</div>}
      {props.quality !== 'low' && <div className="vignette" />}
      <Canvas
        key={props.quality}
        shadows={props.quality !== 'low' ? 'percentage' : false}
        dpr={dpr}
        gl={{ antialias: props.quality !== 'low', powerPreference: 'high-performance' }}
        camera={{ fov: FOV, near: 0.1, far: 60 }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          gl.outputColorSpace = SRGBColorSpace;
          const el = gl.domElement;
          el.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            // Changing quality remounts the canvas and drops the old context. That event is not a device failure.
            if (mounted.current && el.isConnected) setLost(true);
          });
        }}
      >
        <World {...props} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
