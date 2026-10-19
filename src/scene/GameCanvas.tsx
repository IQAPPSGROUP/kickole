import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { BackSide, CanvasTexture, PMREMGenerator, PerspectiveCamera, SRGBColorSpace, Vector3 } from 'three';
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
import { prefersReducedMotion } from './juice';
import { ENVIRONMENT_THEME } from './environment';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';
import { sampleOpeningCamera } from './openingCamera';
import { isOpeningIntroActive, isOpeningIntroDone, tickOpeningIntro } from './openingIntro';

function SunsetSky() {
  const map = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    if (g) {
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#6C5CE7');
      grad.addColorStop(0.42, '#FF8A5B');
      grad.addColorStop(0.7, '#FF4F9A');
      grad.addColorStop(1, '#FFD93D');
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 256);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
  useEffect(() => () => map.dispose(), [map]);
  return (
    <mesh renderOrder={-10} position={[0, 8, -16]} frustumCulled={false}>
      <planeGeometry args={[90, 48]} />
      <meshBasicMaterial map={map} side={BackSide} fog={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

const FOV = GAMEPLAY_FOV;
const TARGET = GAMEPLAY_TARGET;

const BASE = new Vector3();
const LOOK = new Vector3();
const INTRO_POS = new Vector3();
const INTRO_TARGET = new Vector3();

function applyGameplayCamera(cam: PerspectiveCamera, aspect: number) {
  cam.fov = FOV;
  gameplayCameraPosition(aspect, BASE);
  cam.position.copy(BASE);
  cam.lookAt(TARGET);
  cam.updateProjectionMatrix();
}

/** Three-quarter front camera that fits the play area in portrait and landscape, with kick push-in and shake. */
function CameraRig({ shake }: { shake: boolean }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    if (isOpeningIntroActive()) {
      const u = tickOpeningIntro(0);
      const fov = sampleOpeningCamera(u, aspect, ENVIRONMENT_THEME, INTRO_POS, INTRO_TARGET);
      cam.fov = fov;
      cam.position.copy(INTRO_POS);
      cam.lookAt(INTRO_TARGET);
      cam.updateProjectionMatrix();
      gameplayCameraPosition(aspect, BASE);
      return;
    }
    applyGameplayCamera(cam, aspect);
  }, [camera, size]);
  useFrame((state, dt) => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / Math.max(1, size.height);
    if (!isOpeningIntroDone()) {
      // idle/waiting hold the start pose (u=0); playing advances; skip/finish snaps to endpoint.
      const u = isOpeningIntroActive() ? tickOpeningIntro(dt) : 0;
      const fov = sampleOpeningCamera(u, aspect, ENVIRONMENT_THEME, INTRO_POS, INTRO_TARGET);
      if (cam.fov !== fov) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      cam.position.copy(INTRO_POS);
      cam.lookAt(INTRO_TARGET);
      gameplayCameraPosition(aspect, BASE);
      fx.push = 0;
      fx.shake = 0;
      return;
    }
    if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
    fx.push = Math.max(0, fx.push - dt * 3);
    fx.shake = Math.max(0, fx.shake - dt * 4);
    const reduced = prefersReducedMotion();
    if (reduced) fx.swoop = 0;
    fx.swoop = Math.max(0, fx.swoop - dt * 0.72);
    if (BASE.lengthSq() === 0) gameplayCameraPosition(aspect, BASE);
    const swoop = fx.swoop;
    if (!shake && swoop <= 0) {
      if (cam.fov !== FOV) {
        cam.fov = FOV;
        cam.updateProjectionMatrix();
      }
      cam.position.copy(BASE);
      cam.lookAt(TARGET);
      return;
    }
    const t = state.clock.elapsedTime;
    LOOK.copy(TARGET).sub(BASE).multiplyScalar(fx.push * 0.03);
    camera.position.copy(BASE).add(LOOK);
    if (shake) {
      camera.position.x += Math.sin(t * 55) * 0.015 * fx.shake;
      camera.position.y += Math.cos(t * 63) * 0.015 * fx.shake;
    }
    if (swoop > 0) {
      camera.position.x += Math.sin(swoop * 1.15) * 0.62;
      camera.position.y += swoop * 0.32;
      camera.position.z -= swoop * 0.38;
      const nextFov = FOV - swoop * 5.5;
      if (Math.abs(cam.fov - nextFov) > 0.05) {
        cam.fov = nextFov;
        cam.updateProjectionMatrix();
      }
    } else if (cam.fov !== FOV) {
      cam.fov = FOV;
      cam.updateProjectionMatrix();
    }
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

/** Unsubscribe before a quality change disposes this canvas and releases its GL context. */
function ContextLossGuard({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);
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
  const mapSize = quality === 'high' ? 1024 : 512;
  return (
    <>
      <color attach="background" args={[ENVIRONMENT_THEME === 'beach' ? '#8dc5cb' : '#6C5CE7']} />
      <fog attach="fog" args={ENVIRONMENT_THEME === 'beach' ? ['#8dc5cb', 24, 52] : ['#FF8A5B', 11, 28]} />
      <CameraRig shake={quality !== 'low'} />
      {quality === 'high' && <Environment />}
      <Simulation controller={controller} />
      <hemisphereLight args={ENVIRONMENT_THEME === 'beach' ? ['#fff1dc', '#12363f', 0.95] : ['#FF8A5B', '#1E2A5A', 0.72]} />
      {ENVIRONMENT_THEME === 'beach' && <ambientLight intensity={0.32} />}
      <directionalLight
        position={[-2.8, 2.6, -1.4]}
        intensity={quality === 'low' ? 0.25 : 0.55}
        color="#FF4F9A"
      />
      {quality !== 'low' && (
        <directionalLight position={[0.4, 3.2, -2.6]} intensity={0.32} color="#FFD93D" />
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.12]}>
        <circleGeometry args={[0.48, quality === 'low' ? 14 : 28]} />
        <meshBasicMaterial color="#222831" transparent opacity={quality === 'low' ? 0.32 : 0.48} depthWrite={false} />
      </mesh>
      <directionalLight
        position={[2.6, 7, 3.2]}
        intensity={ENVIRONMENT_THEME === 'beach' ? 2.3 : 2.5}
        color={ENVIRONMENT_THEME === 'beach' ? '#ffe9c7' : '#FFF6E8'}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={-3}
        shadow-camera-right={3}
        shadow-camera-top={4}
        shadow-camera-bottom={-3}
        shadow-camera-near={1}
        shadow-camera-far={14}
        shadow-bias={-0.0004}
        shadow-radius={quality === 'high' ? 3 : 1}
      />
      {ENVIRONMENT_THEME !== 'beach' && <SunsetSky />}
      <Court shadows={shadows} quality={quality} />
      {shadows && quality === 'high' && (
        <ContactShadows position={[0, 0.006, 0.2]} opacity={0.38} scale={4} blur={2.2} far={1.2} resolution={256} color="#1E2A5A" />
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
  const markLost = useCallback(() => setLost(true), []);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;
  if (lost) return <GlError message="The graphics context was lost. Reload to continue." />;

  const dpr: [number, number] = props.quality === 'low' ? [1, 1] : props.quality === 'medium' ? [1, 1.25] : [1, 1.5];
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
      >
        <ContextLossGuard onLost={markLost} />
        <World {...props} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
