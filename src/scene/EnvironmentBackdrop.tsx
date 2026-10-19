import { Component, Suspense, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Quality } from '../game/storage';
import { ENVIRONMENT_LOD, ENVIRONMENT_SCALE, ENVIRONMENT_OFFSET_Z } from './environment';

class BackdropBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('Environment unavailable; using built-in hillside.', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  // One static atlas mesh, no colliders, animations, shadow passes or frame callbacks.
  // useGLTF owns the shared resources; quality switches must not dispose its cache.
  return <group scale={ENVIRONMENT_SCALE} position={[0, 0, ENVIRONMENT_OFFSET_Z]}><primitive object={scene} dispose={null} /></group>;
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
