import { Component, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Material, Mesh, Object3D } from 'three';
import type { Quality } from '../game/storage';
import {
  ENVIRONMENT_LOD,
  ENVIRONMENT_SCALE,
  ENVIRONMENT_OFFSET_X,
  ENVIRONMENT_OFFSET_Y,
  ENVIRONMENT_OFFSET_Z,
} from './environment';

class BackdropBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('Environment unavailable; using built-in hillside.', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function prepareBackdrop(root: Object3D) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => {
      const mat = material as Material & { fog?: boolean; envMapIntensity?: number };
      // Court fog is tuned for the play area; without this the hillside washes into the sky.
      mat.fog = false;
      if (typeof mat.envMapIntensity === 'number') mat.envMapIntensity = 0.55;
      mat.needsUpdate = true;
    });
  });
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  useLayoutEffect(() => { prepareBackdrop(scene); }, [scene]);
  // One static atlas mesh, no colliders, animations, shadow passes or frame callbacks.
  // useGLTF owns the shared resources; quality switches must not dispose its cache.
  return (
    <group
      scale={ENVIRONMENT_SCALE}
      position={[ENVIRONMENT_OFFSET_X, ENVIRONMENT_OFFSET_Y, ENVIRONMENT_OFFSET_Z]}
    >
      <primitive object={scene} dispose={null} />
    </group>
  );
}

/** Only the selected quality file is requested; the original hillside stays usable on load failure. */
export function EnvironmentBackdrop({ quality, fallback }: { quality: Quality; fallback: ReactNode }) {
  const url = `${import.meta.env.BASE_URL}models/environment/hillside-lod${ENVIRONMENT_LOD[quality]}.glb`;
  if (import.meta.env.VITE_USE_GLB_ENVIRONMENT === 'false') return fallback;
  return (
    <BackdropBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}><Model url={url} /></Suspense>
    </BackdropBoundary>
  );
}
