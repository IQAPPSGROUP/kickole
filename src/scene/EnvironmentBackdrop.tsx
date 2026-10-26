import { Component, Suspense, useLayoutEffect, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import { attachLocalDecoders, DRACO_DECODER_PATH } from './decoders';
import { Color, type Material, type Mesh, type Object3D } from 'three';
import type { Quality } from '../game/storage';
import {
  ENVIRONMENT_LOD,
  ENVIRONMENT_SCALE,
  ENVIRONMENT_OFFSET_X,
  ENVIRONMENT_OFFSET_Y,
  ENVIRONMENT_OFFSET_Z,
  type EnvironmentTheme,
} from './environment';
class BackdropBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn('Environment unavailable; using built-in scenery.', error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const SUNSET = new Color('#6C5CE7');

function prepareBackdrop(root: Object3D, theme: EnvironmentTheme) {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    list.forEach((material) => {
      const mat = material as Material & { fog?: boolean; envMapIntensity?: number };
      // Court fog is tuned for the play area; without this the backdrop washes into the sky.
      mat.fog = false;
      if (typeof mat.envMapIntensity === 'number') mat.envMapIntensity = backdropEnv(theme);
      const tinted = material as Material & { color?: Color };
      if (theme === 'street' && tinted.color?.isColor) tinted.color.lerp(SUNSET, 0.22);
      mat.needsUpdate = true;
    });
  });
}

function Model({ url, theme }: { url: string; theme: EnvironmentTheme }) {
  const { scene } = useGLTF(url, DRACO_DECODER_PATH, true, attachLocalDecoders);
  useLayoutEffect(() => {
    prepareBackdrop(scene, theme);
  }, [scene, theme]);
  // One static atlas mesh, no colliders, animations, shadow passes or frame callbacks.
  // useGLTF owns the shared resources; quality switches must not dispose its cache.
  const beach = theme === 'beach';
  if (theme === 'alley') return null;
  return (
    <group
      scale={beach ? 1 : ENVIRONMENT_SCALE}
      position={beach ? [0, 0, 0] : [ENVIRONMENT_OFFSET_X, ENVIRONMENT_OFFSET_Y, ENVIRONMENT_OFFSET_Z]}
    >
      <primitive object={scene} dispose={null} />
    </group>
  );
}

/** Only the selected quality file is requested; built-in scenery remains usable on load failure. */
function backdropEnv(theme: EnvironmentTheme): number {
  switch (theme) {
    case 'street': return 0.25;
    case 'beach': return 0.4;
    case 'alley': return 0.35;
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

function backdropPath(theme: EnvironmentTheme): string | null {
  switch (theme) {
    case 'beach': return 'beach/beach';
    case 'street': return 'environment/hillside';
    case 'alley': return null;
    default: {
      const neverTheme: never = theme;
      return neverTheme;
    }
  }
}

export function EnvironmentBackdrop({ quality, fallback, theme = 'street' }: { quality: Quality; fallback: ReactNode; theme?: EnvironmentTheme }) {
  const path = backdropPath(theme);
  if (!path) return fallback;
  const url = `${import.meta.env.BASE_URL}models/${path}-lod${ENVIRONMENT_LOD[quality]}.glb`;
  if (import.meta.env.VITE_USE_GLB_ENVIRONMENT === 'false') return fallback;
  return (
    <BackdropBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}><Model url={url} theme={theme} /></Suspense>
    </BackdropBoundary>
  );
}
