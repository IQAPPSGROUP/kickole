import { Component, Suspense, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import type { Quality } from '../game/storage';
import { ENVIRONMENT_LOD, ENVIRONMENT_SCALE, ENVIRONMENT_OFFSET_Z, type EnvironmentTheme } from './environment';

class BackdropBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { console.warn('Environment unavailable; using built-in scenery.', error); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function Model({ url, theme }: { url: string; theme: EnvironmentTheme }) {
  const { scene } = useGLTF(url);
  // One static atlas mesh, no colliders, animations, shadow passes or frame callbacks.
  // useGLTF owns the shared resources; quality switches must not dispose its cache.
  return <group scale={theme === 'beach' ? 1 : ENVIRONMENT_SCALE} position={[0, 0, theme === 'beach' ? 0 : ENVIRONMENT_OFFSET_Z]}><primitive object={scene} dispose={null} /></group>;
}

/** Only the selected quality file is requested; built-in scenery remains usable on load failure. */
export function EnvironmentBackdrop({ quality, fallback, theme = 'street' }: { quality: Quality; fallback: ReactNode; theme?: EnvironmentTheme }) {
  const path = theme === 'beach' ? 'beach/beach' : 'environment/hillside';
  const url = `${import.meta.env.BASE_URL}models/${path}-lod${ENVIRONMENT_LOD[quality]}.glb`;
  if (import.meta.env.VITE_USE_GLB_ENVIRONMENT === 'false') return fallback;
  return (
    <BackdropBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}><Model url={url} theme={theme} /></Suspense>
    </BackdropBoundary>
  );
}
