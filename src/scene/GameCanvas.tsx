import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows } from '@react-three/drei';
import { PerspectiveCamera, Vector3 } from 'three';
import type { GameController } from '../game/controller';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { Character } from './Character';
import { Ball } from './Ball';
import { Court } from './Court';

const TARGET = new Vector3(0, 1.25, 0.3);
const DIR = new Vector3(0.42, 0.38, 0.82).normalize();
const FOV = 40;

/** Three-quarter front camera that fits the play area in portrait and landscape. */
function CameraRig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as PerspectiveCamera;
    const aspect = size.width / size.height;
    const tan = Math.tan((FOV * Math.PI) / 360);
    const dist = Math.max(2.55 / tan, 1.5 / (tan * aspect)) + 0.4;
    cam.fov = FOV;
    cam.position.copy(TARGET).addScaledVector(DIR, dist);
    cam.lookAt(TARGET);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Simulation({ controller }: { controller: GameController }) {
  useFrame((_, dt) => controller.tick(dt));
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
  useEffect(onReady, [onReady]);
  const mapSize = quality === 'high' ? 2048 : 1024;
  return (
    <>
      <color attach="background" args={['#142D35']} />
      <fog attach="fog" args={['#142D35', 9, 18]} />
      <CameraRig />
      <Simulation controller={controller} />
      <hemisphereLight args={['#F7F5ED', '#12363f', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={[2.5, 6, 4]}
        intensity={2.1}
        color="#fff7e6"
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
      <pointLight position={[-3, 2.5, 2]} intensity={6} color="#12BFA6" distance={9} />
      <Court shadows={shadows} />
      {shadows && quality === 'high' && (
        <ContactShadows position={[0, 0.006, 0.2]} opacity={0.35} scale={4} blur={2.4} far={1.2} resolution={256} color="#05161b" />
      )}
      <Character engine={controller.engine} skin={skin} />
      <Ball engine={controller.engine} skin={skin} />
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
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  if (!supported) return <GlError message="Your browser or device does not support WebGL. Try updating your browser." />;
  if (lost) return <GlError message="The graphics context was lost. Reload to continue." />;

  const dpr: [number, number] = props.quality === 'low' ? [1, 1] : props.quality === 'medium' ? [1, 1.5] : [1, 2];
  return (
    <Boundary fallback={<GlError message="Something went wrong while drawing the game." />}>
      {!ready && <div className="loading"><div className="spinner" />Loading…</div>}
      <Canvas
        key={props.quality}
        shadows={props.quality !== 'low'}
        dpr={dpr}
        gl={{ antialias: props.quality !== 'low', powerPreference: 'high-performance' }}
        camera={{ fov: FOV, near: 0.1, far: 60 }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (mounted.current) setLost(true); });
        }}
      >
        <World {...props} onReady={() => setReady(true)} />
      </Canvas>
    </Boundary>
  );
}
