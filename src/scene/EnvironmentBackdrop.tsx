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
import { notifyEnvironmentReady } from './openingIntro';

class BackdropBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn('Environment unavailable; using built-in scenery.', error);
    notifyEnvironmentReady();
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

const SUNSET = new Color('#6C5CE7');
const BEACH_SUN = new Color('#fff6e4');

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
      if (typeof mat.envMapIntensity === 'number') mat.envMapIntensity = theme === 'street' ? 0.25 : 0.9;
      const tinted = material as Material & { color?: Color };
      if (theme === 'street' && tinted.color?.isColor) tinted.color.lerp(SUNSET, 0.22);
      if (theme === 'beach' && tinted.color?.isColor) tinted.color.lerp(BEACH_SUN, 0.22);
      mat.needsUpdate = true;
    });
  });
}

function Model({ url, theme }: { url: string; theme: EnvironmentTheme }) {
  const { scene } = useGLTF(url, DRACO_DECODER_PATH, true, attachLocalDecoders);
  useLayoutEffect(() => {
    prepareBackdrop(scene, theme);
    notifyEnvironmentReady();
  }, [scene, theme]);
  // One static atlas mesh, no colliders, animations, shadow passes or frame callbacks.
  // useGLTF owns the shared resources; quality switches must not dispose its cache.
  const beach = theme === 'beach';
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
export function EnvironmentBackdrop({ quality, fallback, theme = 'street' }: { quality: Quality; fallback: ReactNode; theme?: EnvironmentTheme }) {
  const path = theme === 'beach' ? 'beach/beach' : 'environment/hillside';
  const url = `${import.meta.env.BASE_URL}models/${path}-lod${ENVIRONMENT_LOD[quality]}.glb`;
  if (import.meta.env.VITE_USE_GLB_ENVIRONMENT === 'false') {
    notifyEnvironmentReady();
    return fallback;
  }
  return (
    <BackdropBoundary key={url} fallback={fallback}>
      <Suspense fallback={fallback}><Model url={url} theme={theme} /></Suspense>
    </BackdropBoundary>
  );
}
