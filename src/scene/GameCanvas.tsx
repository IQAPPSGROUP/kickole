import { Component, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { AgXToneMapping, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import type { GameController } from '../game/controller';
import type { Skin } from '../game/skins';
import type { GraphicsChoice, Quality } from '../game/storage';
import { CharacterSwitch } from './CharacterSwitch';
import { Ball } from './Ball';
import { Court } from './Court';
import { Effects } from './Effects';
import { inspector } from './inspector';
import { fx } from './fx';
import { KeyLight } from './KeyLight';
import { cameraSway, prefersReducedMotion } from './juice';
import { SceneLife } from './SceneLife';
import { ENVIRONMENT_THEME } from './environment';
import { PostFX } from './PostFX';
import { STREET_EXPOSURE, STREET_FILL } from './daylight';
import { locationHemi } from './locations';
import { PhotoSky } from './PhotoSky';
import { installPcss, restorePcss } from './pcss';
import {
  createFpsGuard,
  detectTier,
  getDeviceSnapshot,
  profileFor,
  publishRunningTier,
  rememberGpu,
  resolveTier,
  stepFpsGuard,
  subscribeDevice,
} from './qualityTier';
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
function CameraRig({ shake, quality }: { shake: boolean; quality: Quality }) {
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
    const reduced = prefersReducedMotion();
    if (reduced) fx.swoop = 0;
    fx.swoop = Math.max(0, fx.swoop - dt * 0.72);
    if (BASE.lengthSq() === 0) gameplayCameraPosition(aspect, BASE);
    const swoop = fx.swoop;
    const swayStill = cameraSway(state.clock.elapsedTime, quality, reduced);
    if (!shake && swoop <= 0 && swayStill.x === 0 && swayStill.y === 0) {
      if (cam.fov !== FOV) {
        cam.fov = FOV;
        cam.updateProjectionMatrix();
      }
      cam.position.copy(BASE);
      cam.lookAt(TARGET);
      return;
    }
    const t = state.clock.elapsedTime;
    const sway = cameraSway(t, quality, reduced);
    LOOK.copy(TARGET).sub(BASE).multiplyScalar(fx.push * 0.03);
    camera.position.copy(BASE).add(LOOK);
    camera.position.x += sway.x;
    camera.position.y += sway.y;
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

function StreetTone({ exposure }: { exposure: number }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    gl.toneMapping = AgXToneMapping;
    gl.toneMappingExposure = exposure;
  }, [gl, exposure]);
  return null;
}

function FpsWatch({ tier, onTier }: { tier: Quality; onTier: (next: Quality) => void }) {
  const guard = useMemo(() => createFpsGuard(), []);
  const samples = useMemo(() => [] as number[], []);
  useFrame((_, dt) => {
    if (dt <= 0 || dt > 0.5) {
      guard.underSec = 0;
      samples.length = 0;
      return;
    }
    samples.push(dt);
    let span = 0;
    for (let i = samples.length - 1; i >= 0; i--) {
      span += samples[i];
      if (span >= 1) {
        samples.splice(0, i);
        break;
      }
    }
    const total = samples.reduce((sum, n) => sum + n, 0);
    const fps = samples.length / total;
    const next = stepFpsGuard(guard, tier, fps, dt);
    if (next !== tier) onTier(next);
  });
  return null;
}

function GpuProbe() {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const context = gl.getContext();
    const info = context.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? context.getParameter(info.UNMASKED_RENDERER_WEBGL) : '';
    rememberGpu(typeof renderer === 'string' ? renderer : '');
  }, [gl]);
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
  const theme = ENVIRONMENT_THEME;
  const profile = profileFor(quality);
  const shadows = profile.shadows !== 'none';
  const hemi = locationHemi(theme);
  useEffect(() => { onReady(); }, [onReady]);
  const postProfile = theme === 'beach' ? { ...profile, bloom: false, dof: false } : profile;
  return (
    <>
      <StreetTone exposure={STREET_EXPOSURE} />
      <color attach="background" args={['#7ec8ff']} />
      <PhotoSky theme={theme} quality={quality} />
      <CameraRig shake={quality !== 'low'} quality={quality} />
      <Simulation controller={controller} />
      <PerfProbe />
      <hemisphereLight args={[hemi.sky, hemi.ground, hemi.intensity]} />
      <directionalLight position={[-4.2, 4.2, -2.4]} intensity={STREET_FILL.intensity} color={STREET_FILL.color} />
      <KeyLight quality={quality} engine={controller.engine} />
      <Court shadows={shadows} quality={quality} />
      <SceneLife engine={controller.engine} quality={quality} />
      {profile.contactShadows && (
        <ContactShadows
          position={[0, 0.006, 0.15]}
          opacity={0.42}
          scale={3.1}
          blur={2.1}
          far={1.5}
          resolution={quality === 'low' ? 128 : 256}
          color="#3d2a22"
        />
      )}
      <CharacterSwitch key={skin.playerBody} engine={controller.engine} skin={skin} quality={quality} />
      <Ball engine={controller.engine} skin={skin} quality={quality} />
      <Effects engine={controller.engine} quality={quality} />
      <PostFX profile={postProfile} engine={controller.engine} />
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

export function GameCanvas({ controller, skin, graphics }: { controller: GameController; skin: Skin; graphics: GraphicsChoice }) {
  const [supported] = useState(hasWebGL);
  const [ready, setReady] = useState(false);
  const [lost, setLost] = useState(false);
  const device = useSyncExternalStore(subscribeDevice, getDeviceSnapshot);
  const detected = useMemo(() => detectTier(device), [device]);
  const forced = useMemo(() => forcedTier(), []);
  const requested = forced ?? resolveTier(graphics, detected);
  const [tier, setTier] = useState<Quality>(requested);
  useEffect(() => { setTier(requested); }, [requested]);
  useEffect(() => {
    publishRunningTier(tier);
    (globalThis as { __KICKOLE_TIER?: Quality }).__KICKOLE_TIER = tier;
  }, [tier]);
  const markReady = useCallback(() => setReady(true), []);
  const markLost = useCallback(() => setLost(true), []);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;
  if (lost) return <GlError message="The graphics context was lost. Reload to continue." />;

  const profile = profileFor(tier);
  if (profile.shadowFilter === 'pcss') installPcss();
  else restorePcss();
  const dpr = profile.dpr;
  const shadowsOn = profile.shadows !== 'none';
  const shadowType = !shadowsOn ? false : profile.shadowFilter === 'pcss' ? 'basic' : 'variance';
  return (
    <Boundary fallback={<GlError message="Something went wrong while drawing the game." />}>
      {!ready && <div className="loading"><div className="spinner" />Loading…</div>}
      {tier !== 'low' && <div className="vignette" />}
      <Canvas
        key={tier}
        shadows={shadowType}
        dpr={dpr}
        gl={{
          antialias: profile.aa === 'none',
          powerPreference: 'high-performance',
          toneMapping: AgXToneMapping,
          toneMappingExposure: STREET_EXPOSURE,
        }}
        camera={{ fov: FOV, near: 0.1, far: 60 }}
      >
        <ContextLossGuard onLost={markLost} />
        <GpuProbe />
        {!forced && <FpsWatch tier={tier} onTier={setTier} />}
        <World controller={controller} skin={skin} quality={tier} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
