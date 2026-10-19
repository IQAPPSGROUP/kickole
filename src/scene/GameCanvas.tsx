import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { PMREMGenerator, PerspectiveCamera, Vector3 } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { GameController } from '../game/controller';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { CharacterSwitch } from './CharacterSwitch';
import { Ball } from './Ball';
import { Court } from './Court';
import { Effects } from './Effects';
import { inspector } from './inspector';
import { fx } from './fx';

const TARGET = new Vector3(0, 1.25, 0.3);
const DIR = new Vector3(0.42, 0.38, 0.82).normalize();
const FOV = 40;

const BASE = new Vector3();
const LOOK = new Vector3();

/** Three-quarter front camera that fits the play area in portrait and landscape, with kick push-in and shake. */
function CameraRig({ shake }: { shake: boolean }) {
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
    fx.push = Math.max(0, fx.push - dt * 3);
    fx.shake = Math.max(0, fx.shake - dt * 4);
    if (!shake || BASE.lengthSq() === 0) return;
    const t = state.clock.elapsedTime;
    LOOK.copy(TARGET).sub(BASE).multiplyScalar(fx.push * 0.03);
    camera.position.copy(BASE).add(LOOK);
    camera.position.x += Math.sin(t * 55) * 0.015 * fx.shake;
    camera.position.y += Math.cos(t * 63) * 0.015 * fx.shake;
    camera.lookAt(TARGET);
  });
  return null;
}

/** Soft image-based lighting from a procedural room (no external HDR download). */
function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pm = new PMREMGenerator(gl);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = null; env.dispose(); pm.dispose(); };
  }, [gl, scene]);
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
  onReady: () => void;
}

function World({ controller, skin, quality, onReady }: SceneProps) {
  const shadows = quality !== 'low';
  useEffect(() => { onReady(); }, [onReady]);
  const mapSize = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <color attach="background" args={['#234F4B']} />
      <fog attach="fog" args={['#234F4B', 10, 22]} />
      <CameraRig shake={quality !== 'low'} />
      {quality === 'high' && <Environment />}
      <Simulation controller={controller} />
      <hemisphereLight args={['#fff1dc', '#12363f', 0.8]} />
      <ambientLight intensity={0.2} />
      <directionalLight
        position={[2.5, 6, 4]}
        intensity={2.3}
        color="#ffe9c7"
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      <pointLight position={[-3, 2.5, 1]} intensity={6} color="#12BFA6" distance={9} />
      {quality !== 'low' && <pointLight position={[3, 2.2, -1.5]} intensity={5} color="#FF805D" distance={8} />}
      <Court shadows={shadows} quality={quality} />
      {shadows && quality === 'high' && (
        <ContactShadows position={[0, 0.006, 0.2]} opacity={0.35} scale={4} blur={2.4} far={1.2} resolution={256} color="#05161b" />
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
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (mounted.current) setLost(true); });
        }}
      >
        <World {...props} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
