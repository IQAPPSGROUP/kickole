import { useEffect, useState, useSyncExternalStore } from 'react';
import { useThree } from '@react-three/fiber';
import { BackSide, EquirectangularReflectionMapping, PMREMGenerator, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { Quality } from '../game/storage';
import { notifyEnvironmentReady } from './openingIntro';
import { ALLEY_SKY_LOOK, alleySkyUrl } from './alleyLayout';
import { gpuGeneration, subscribeGpuRestore } from './gpuRestore';

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
    float up = clamp(dir.y * 0.55 + 0.45, 0.0, 1.0);
    vec3 horizon = vec3(0.62, 0.78, 0.95);
    vec3 zenith = vec3(0.22, 0.48, 0.86);
    vec3 color = mix(horizon, zenith, pow(up, 0.7));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Bright unfogged sky if the photograph cannot load. */
function BrightFallback() {
  return (
    <mesh frustumCulled={false}>
      <sphereGeometry args={[80, 24, 12]} />
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

/**
 * City photograph behind the open side of the alley.
 * The JPEG is the visible background on every tier. High and medium also build
 * a small PMREM from it. A context restore bumps `gpuGeneration`, which reloads
 * the photograph and rebuilds the PMREM — a render target cannot be re-uploaded.
 */
export function AlleySky({ quality }: { quality: Quality }) {
  const { gl, scene } = useThree();
  const generation = useSyncExternalStore(subscribeGpuRestore, gpuGeneration);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const pm = quality === 'low' ? null : new PMREMGenerator(gl);
    let jpg: Texture | null = null;
    let env: Texture | null = null;
    let pmDisposed = false;
    const disposePm = () => {
      if (pmDisposed || !pm) return;
      pmDisposed = true;
      pm.dispose();
    };
    const applyLook = () => {
      scene.backgroundRotation.set(ALLEY_SKY_LOOK.pitch, ALLEY_SKY_LOOK.yaw, 0);
      scene.environmentRotation.copy(scene.backgroundRotation);
      scene.backgroundIntensity = ALLEY_SKY_LOOK.background;
      scene.fog = null;
    };
    new TextureLoader().load(alleySkyUrl(quality), (loaded) => {
      if (!alive) {
        loaded.dispose();
        disposePm();
        return;
      }
      jpg = loaded;
      loaded.mapping = EquirectangularReflectionMapping;
      loaded.colorSpace = SRGBColorSpace;
      loaded.needsUpdate = true;
      scene.background = loaded;
      if (pm) {
        env = pm.fromEquirectangular(loaded).texture;
        scene.environment = env;
        scene.environmentIntensity = ALLEY_SKY_LOOK.environment;
      }
      disposePm();
      applyLook();
      notifyEnvironmentReady();
    }, undefined, () => {
      disposePm();
      if (alive) setFailed(true);
      notifyEnvironmentReady();
    });
    return () => {
      alive = false;
      if (scene.background === jpg) scene.background = null;
      scene.environment = null;
      jpg?.dispose();
      env?.dispose();
      disposePm();
    };
  }, [gl, scene, quality, generation]);
  return failed ? <BrightFallback /> : null;
}
