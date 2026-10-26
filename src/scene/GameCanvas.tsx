import { Component, useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AgXToneMapping, BackSide, EquirectangularReflectionMapping, PMREMGenerator, PerspectiveCamera, Vector3, type WebGLRenderer } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { releaseDecodedMusic, restoreMusicAfterContext } from '../game/audio';
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
import { AlleySky } from './AlleySky';
import { ALLEY_VIEWS, alleyModelUrl, alleyViewFromSearch } from './alleyLayout';
import { ENVIRONMENT_THEME } from './environment';
import { PostFX } from './PostFX';
import { STREET_ENV_INTENSITY, STREET_EXPOSURE, STREET_FILL, STREET_HDR_URL, STREET_HEMI } from './daylight';
import { installPcss, restorePcss } from './pcss';
import { contextLostNeedsReload, CONTEXT_RESTORE_WAIT_MS } from './glRecovery';
import { gpuGeneration, notifyGpuRestore, reuploadSceneTextures, subscribeGpuRestore } from './gpuRestore';
import { characterModelUrl } from './rig';
import {
  cappedDpr,
  createFpsGuard,
  detectTier,
  getDeviceSnapshot,
  profileFor,
  publishRunningTier,
  rememberGpu,
  resolveTier,
  stepFpsGuard,
  subscribeDevice,
  useMsaa,
} from './qualityTier';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';

const FOV = GAMEPLAY_FOV;
const TARGET = GAMEPLAY_TARGET;

const BASE = new Vector3();
const LOOK = new Vector3();

interface Kickcam {
  fov: number;
  pos: [number, number, number];
  look: [number, number, number];
}

function devKickcam(): Kickcam | null {
  if (typeof location !== 'undefined') {
    const view = alleyViewFromSearch(location.search);
    if (view) {
      const framed = ALLEY_VIEWS[view];
      return { fov: framed.fov, pos: [...framed.position], look: [...framed.look] };
    }
  }
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

/** Head-height camera aimed at the back brick, with kick push-in and shake. */
function CameraRig({ shake, quality }: { shake: boolean; quality: Quality }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    applyGameplayCamera(cam, size.width / Math.max(1, size.height));
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

/** Drop cached GLBs so a restored context decodes fresh images instead of dead bitmaps. */
function clearModelCache() {
  useGLTF.clear(alleyModelUrl('high'));
  useGLTF.clear(alleyModelUrl('medium'));
  useGLTF.clear(alleyModelUrl('low'));
  for (const body of ['male', 'female'] as const) {
    useGLTF.clear(characterModelUrl(0, body));
    useGLTF.clear(characterModelUrl(1, body));
  }
}

/**
 * Cancel the loss so the browser fires `webglcontextrestored` on this same canvas.
 * Unmounting here used to destroy the canvas and leave the reload screen up.
 */
function ContextLossGuard({ onLost, onRestored }: { onLost: () => void; onRestored: () => void }) {
  const gl = useThree(state => state.gl);
  const scene = useThree(state => state.scene);
  const camera = useThree(state => state.camera);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => {
      event.preventDefault();
      onLost();
    };
    const restored = () => {
      reuploadSceneTextures(gl, scene);
      clearModelCache();
      try {
        gl.compile(scene, camera);
      } catch (error) {
        console.warn('material recompile failed', error);
      }
      gl.shadowMap.needsUpdate = true;
      notifyGpuRestore();
      onRestored();
    };
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, scene, camera, onLost, onRestored]);
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

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 horizon = vec3(0.10, 0.38, 0.86);
    vec3 zenith = vec3(0.02, 0.16, 0.62);
    vec3 color = mix(horizon, zenith, pow(up, 0.65));
    vec3 sunDir = normalize(vec3(0.55, 0.78, 0.28));
    float sun = pow(max(dot(dir, sunDir), 0.0), 360.0);
    float glow = pow(max(dot(dir, sunDir), 0.0), 8.0);
    color += vec3(1.0, 0.62, 0.28) * sun * 1.6;
    color += vec3(1.0, 0.78, 0.45) * glow * 0.18;
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Deep blue sky with a warm sun. The gameplay camera looks at the horizon, so an equirect horizon would read grey. */
function CarnivalSky() {
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[48, 28, 16]} />
      <shaderMaterial
        side={BackSide}
        depthWrite={false}
        fog={false}
        toneMapped={false}
        vertexShader={SKY_VERTEX}
        fragmentShader={SKY_FRAGMENT}
      />
    </mesh>
  );
}

/** Shared sunny HDR for reflections. CarnivalSky is the visible sky. */
function SunnyIbl({ ibl }: { ibl: boolean }) {
  const { gl, scene } = useThree();
  const generation = useSyncExternalStore(subscribeGpuRestore, gpuGeneration);
  useEffect(() => {
    let alive = true;
    let pmDisposed = false;
    let env: ReturnType<PMREMGenerator['fromEquirectangular']>['texture'] | null = null;
    let hdr: { dispose: () => void } | null = null;
    const pm = new PMREMGenerator(gl);
    const disposePm = () => {
      if (pmDisposed) return;
      pmDisposed = true;
      pm.dispose();
    };
    const timer = window.setTimeout(() => {
      new HDRLoader().load(`${import.meta.env.BASE_URL}${STREET_HDR_URL}`, (loaded) => {
        if (!alive) { loaded.dispose(); disposePm(); return; }
        hdr = loaded;
        loaded.mapping = EquirectangularReflectionMapping;
        if (ibl) {
          env = pm.fromEquirectangular(loaded).texture;
          scene.environment = env;
          scene.environmentIntensity = STREET_ENV_INTENSITY;
        }
        disposePm();
      });
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      scene.environment = null;
      scene.background = null;
      env?.dispose();
      hdr?.dispose();
      disposePm();
    };
  }, [gl, scene, ibl, generation]);
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
  const alley = ENVIRONMENT_THEME === 'alley';
  const street = ENVIRONMENT_THEME === 'street';
  const generation = useSyncExternalStore(subscribeGpuRestore, gpuGeneration);
  const profile = profileFor(quality);
  const shadows = profile.shadows !== 'none';
  useEffect(() => { onReady(); }, [onReady]);
  const postProfile = ENVIRONMENT_THEME === 'beach' ? { ...profile, bloom: false, dof: false } : profile;
  return (
    <>
      <StreetTone exposure={STREET_EXPOSURE} />
      <color attach="background" args={[alley ? '#8ec6ef' : '#1a6fd0']} />
      {alley ? <AlleySky quality={quality} /> : <CarnivalSky />}
      <CameraRig shake={quality !== 'low'} quality={quality} />
      {!alley && (street || profile.sky !== 'flat') && <SunnyIbl ibl={profile.ibl} />}
      <Simulation controller={controller} />
      <PerfProbe />
      <hemisphereLight args={[STREET_HEMI.sky, STREET_HEMI.ground, STREET_HEMI.intensity]} />
      <directionalLight position={[-4.2, 4.2, -2.4]} intensity={STREET_FILL.intensity} color={STREET_FILL.color} />
      <KeyLight quality={quality} engine={controller.engine} />
      <Court key={generation} shadows={shadows} quality={quality} />
      <SceneLife engine={controller.engine} quality={quality} />
      {/* drei ContactShadows paints a flat blue disc on this court, so it stays off. */}
      <CharacterSwitch key={`${skin.playerBody}-${generation}`} engine={controller.engine} skin={skin} quality={quality} />
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
  const [lostAt, setLostAt] = useState<number | null>(null);
  const [clock, setClock] = useState(() => Date.now());
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
  const markLost = useCallback(() => {
    releaseDecodedMusic();
    setLostAt((current) => current ?? Date.now());
  }, []);
  const markRestored = useCallback(() => {
    setLostAt(null);
    restoreMusicAfterContext();
  }, []);
  useEffect(() => {
    if (lostAt == null) return;
    const timer = window.setTimeout(() => setClock(Date.now()), CONTEXT_RESTORE_WAIT_MS);
    return () => window.clearTimeout(timer);
  }, [lostAt]);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;

  const showLost = contextLostNeedsReload(lostAt, clock);
  const profile = profileFor(tier);
  if (profile.shadowFilter === 'pcss') installPcss();
  else restorePcss();
  const dpr = cappedDpr(profile.dpr);
  const shadowsOn = profile.shadows !== 'none';
  const shadowType = !shadowsOn ? false : profile.shadowFilter === 'pcss' ? 'basic' : 'variance';
  return (
    <Boundary fallback={<GlError message="Something went wrong while drawing the game." />}>
      {!ready && <div className="loading"><div className="spinner" />Loading…</div>}
      {showLost && <GlError message="The graphics context was lost. Reload to continue." />}
      {tier !== 'low' && <div className="vignette" />}
      <Canvas
        key={tier}
        shadows={shadowType}
        dpr={dpr}
        gl={{
          antialias: useMsaa(),
          powerPreference: 'high-performance',
          toneMapping: AgXToneMapping,
          toneMappingExposure: STREET_EXPOSURE,
        }}
        camera={{ fov: FOV, near: 0.1, far: 60 }}
      >
        <ContextLossGuard onLost={markLost} onRestored={markRestored} />
        <GpuProbe />
        {!forced && <FpsWatch tier={tier} onTier={setTier} />}
        <World controller={controller} skin={skin} quality={tier} onReady={markReady} />
      </Canvas>
    </Boundary>
  );
}
