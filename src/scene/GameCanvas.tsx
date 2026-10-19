import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { AgXToneMapping, PMREMGenerator, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { GameController } from '../game/controller';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { CharacterSwitch } from './CharacterSwitch';
import { Ball } from './Ball';
import { Court } from './Court';
import { Effects } from './Effects';
import { inspector } from './inspector';
import { fx } from './fx';
import { ENVIRONMENT_THEME } from './environment';
import { PostFX } from './PostFX';
import { detectTier, fallbackTier, profileFor, readDevice, startingTier } from './qualityTier';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';
import { sampleOpeningCamera } from './openingCamera';
import { isOpeningIntroActive, isOpeningIntroDone, tickOpeningIntro } from './openingIntro';

const FOV = GAMEPLAY_FOV;
const TARGET = GAMEPLAY_TARGET;

const BASE = new Vector3();
const LOOK = new Vector3();
const INTRO_POS = new Vector3();
const INTRO_TARGET = new Vector3();

interface Kickcam {
  fov: number;
  pos: [number, number, number];
  look: [number, number, number];
}

function devKickcam(): Kickcam | null {
  if (!import.meta.env.DEV) return null;
  return (window as unknown as { __kickcam?: Kickcam | null }).__kickcam ?? null;
}

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
    const kickcam = devKickcam();
    if (kickcam) {
      if (cam.fov !== kickcam.fov) {
        cam.fov = kickcam.fov;
        cam.updateProjectionMatrix();
      }
      cam.position.set(kickcam.pos[0], kickcam.pos[1], kickcam.pos[2]);
      cam.lookAt(kickcam.look[0], kickcam.look[1], kickcam.look[2]);
      return;
    }
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
    if (BASE.lengthSq() === 0) gameplayCameraPosition(aspect, BASE);
    if (!shake) {
      cam.position.copy(BASE);
      cam.lookAt(TARGET);
      return;
    }
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

function StreetTone() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMapping = AgXToneMapping;
    gl.toneMappingExposure = 1;
  }, [gl]);
  return null;
}

/** CC0 sunset IBL. Loaded after the first paint so the character and court colour maps win the initial budget. */
function SunsetIbl() {
  const { gl, scene } = useThree();
  useEffect(() => {
    let alive = true;
    let env: ReturnType<PMREMGenerator['fromEquirectangular']>['texture'] | null = null;
    const pm = new PMREMGenerator(gl);
    const timer = window.setTimeout(() => {
      new HDRLoader().load(`${import.meta.env.BASE_URL}textures/venice_sunset_1k.hdr`, (hdr) => {
        if (!alive) { hdr.dispose(); pm.dispose(); return; }
        env = pm.fromEquirectangular(hdr).texture;
        scene.environment = env;
        scene.background = env;
        scene.backgroundBlurriness = 0.55;
        scene.environmentIntensity = 0.42;
        hdr.dispose();
        pm.dispose();
      });
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      scene.environment = null;
      scene.background = null;
      env?.dispose();
    };
  }, [gl, scene]);
  return null;
}

function FpsWatch({ tier, onTier }: { tier: Quality; onTier: (next: Quality) => void }) {
  const samples = useMemo(() => [] as number[], []);
  useFrame((_, dt) => {
    if (dt <= 0 || dt > 0.5) return;
    samples.push(1000 / (dt * 1000));
    if (samples.length < 45) return;
    const fps = samples.reduce((sum, n) => sum + n, 0) / samples.length;
    samples.length = 0;
    const next = fallbackTier(tier, fps);
    if (next !== tier) onTier(next);
  });
  return null;
}

function PerfProbe() {
  const gl = useThree((state) => state.gl);
  useFrame(() => {
    const info = (gl as WebGLRenderer).info;
    (globalThis as { __KICKOLE_PERF?: { triangles: number; calls: number; textures: number } }).__KICKOLE_PERF = {
      triangles: info.render.triangles,
      calls: info.render.calls,
      textures: info.memory.textures,
    };
  });
  return null;
}

function forcedTier(): Quality | null {
  if (typeof location === 'undefined') return null;
  const value = new URLSearchParams(location.search).get('tier');
  if (value === 'low' || value === 'medium' || value === 'high') return value;
  return null;
}

function World({ controller, skin, quality, onReady }: SceneProps) {
  const street = ENVIRONMENT_THEME !== 'beach';
  const profile = profileFor(quality);
  const shadows = street ? profile.shadows !== 'none' : quality !== 'low';
  useEffect(() => { onReady(); }, [onReady]);
  const mapSize = street ? (profile.shadowMap || 512) : quality === 'high' ? 1024 : 512;
  const wide = street && profile.shadows === 'cascaded';
  const post = street && (profile.ssao || profile.bloom || profile.dof || profile.fxaa);
  return (
    <>
      {street && <StreetTone />}
      <color attach="background" args={[street ? '#3a2a28' : '#8dc5cb']} />
      <fog attach="fog" args={street ? ['#5c3a32', 22, 48] : ['#8dc5cb', 24, 52]} />
      <CameraRig shake={quality !== 'low'} />
      {street && profile.ibl && <SunsetIbl />}
      {!street && quality === 'high' && <Environment />}
      <Simulation controller={controller} />
      <PerfProbe />
      {street ? (
        <>
          <hemisphereLight args={['#ffd2a8', '#1c1614', 0.28]} />
          <directionalLight position={[-4.2, 3.2, -2]} intensity={0.22} color="#8aa4c8" />
        </>
      ) : (
        <>
          <hemisphereLight args={['#fff1dc', '#12363f', 0.95]} />
          <ambientLight intensity={0.32} />
        </>
      )}
      <directionalLight
        position={street ? [6.2, 8.4, 2.4] : [2.6, 7, 3.2]}
        intensity={street ? 3.4 : 2.3}
        color={street ? '#ffe2b0' : '#ffe9c7'}
        castShadow={shadows}
        shadow-mapSize={[mapSize, mapSize]}
        shadow-camera-left={wide ? -6 : -3}
        shadow-camera-right={wide ? 6 : 3}
        shadow-camera-top={wide ? 6 : 4}
        shadow-camera-bottom={wide ? -4 : -3}
        shadow-camera-near={1}
        shadow-camera-far={street ? 22 : 14}
        shadow-bias={-0.0004}
        shadow-radius={wide ? 4 : quality === 'high' ? 3 : 1}
      />
      <Court shadows={shadows} quality={quality} />
      {((street && profile.contactShadows) || (!street && quality === 'high')) && (
        <ContactShadows
          position={[0, 0.006, 0.2]}
          opacity={street ? 0.45 : 0.38}
          scale={4}
          blur={2.2}
          far={1.2}
          resolution={256}
          color={street ? '#1a120e' : '#1E2A5A'}
        />
      )}
      <CharacterSwitch key={skin.playerBody} engine={controller.engine} skin={skin} quality={quality} />
      <Ball engine={controller.engine} skin={skin} quality={quality} />
      <Effects engine={controller.engine} quality={quality} />
      {post && <PostFX profile={profile} engine={controller.engine} />}
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
  const street = ENVIRONMENT_THEME !== 'beach';
  const detected = useMemo(() => readDevice(), []);
  const forced = useMemo(() => forcedTier(), []);
  const [tier, setTier] = useState<Quality>(() => forced ?? (street ? startingTier(props.quality, detectTier(detected)) : props.quality));
  useEffect(() => {
    setTier(forced ?? (street ? startingTier(props.quality, detectTier(detected)) : props.quality));
  }, [props.quality, detected, forced, street]);
  const markReady = useCallback(() => setReady(true), []);
  const markLost = useCallback(() => setLost(true), []);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;
  if (lost) return <GlError message="The graphics context was lost. Reload to continue." />;

  const profile = profileFor(tier);
  const dpr = street ? profile.dpr : (props.quality === 'low' ? [1, 1] : props.quality === 'medium' ? [1, 1.25] : [1, 1.5]) as [number, number];
  const shadowsOn = street ? profile.shadows !== 'none' : props.quality !== 'low';
  return (
    <Boundary fallback={<GlError message="Something went wrong while drawing the game." />}>
      {!ready && <div className="loading"><div className="spinner" />Loading…</div>}
      {tier !== 'low' && <div className="vignette" />}
      <Canvas
        key={tier}
        shadows={shadowsOn ? 'percentage' : false}
        dpr={dpr}
        gl={{
          antialias: street ? !profile.fxaa : props.quality !== 'low',
          powerPreference: 'high-performance',
          ...(street ? { toneMapping: AgXToneMapping } : {}),
        }}
        camera={{ fov: FOV, near: 0.1, far: 60 }}
      >
        <ContextLossGuard onLost={markLost} />
        {street && !forced && <FpsWatch tier={tier} onTier={setTier} />}
        <World {...props} quality={tier} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
