import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { BackSide, EquirectangularReflectionMapping, PMREMGenerator, SRGBColorSpace, type Texture } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { TextureLoader } from 'three';
import type { Quality } from '../game/storage';
import { notifyEnvironmentReady } from './openingIntro';
import { ALLEY_SKY_LOOK, alleySkyUrl } from './alleyLayout';

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
 * City-tower HDRI behind the open side of the alley.
 * High and medium use the 1K HDR for the background and image light.
 * Low uses the tone-mapped JPEG and skips PMREM.
 */
export function AlleySky({ quality }: { quality: Quality }) {
  const { gl, scene } = useThree();
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const pm = quality === 'low' ? null : new PMREMGenerator(gl);
    let hdr: Texture | null = null;
    let env: Texture | null = null;
    let jpg: Texture | null = null;
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
    const useJpeg = () => {
      new TextureLoader().load(alleySkyUrl('low'), (loaded) => {
        if (!alive) { loaded.dispose(); return; }
        jpg = loaded;
        loaded.mapping = EquirectangularReflectionMapping;
        loaded.colorSpace = SRGBColorSpace;
        scene.background = loaded;
        applyLook();
        notifyEnvironmentReady();
      }, undefined, () => {
        if (alive) setFailed(true);
        notifyEnvironmentReady();
      });
    };
    if (quality === 'low') {
      useJpeg();
    } else {
      new HDRLoader().load(alleySkyUrl(quality), (loaded) => {
        if (!alive) { loaded.dispose(); disposePm(); return; }
        hdr = loaded;
        loaded.mapping = EquirectangularReflectionMapping;
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
        useJpeg();
      });
    }
    return () => {
      alive = false;
      scene.background = null;
      scene.environment = null;
      hdr?.dispose();
      env?.dispose();
      jpg?.dispose();
      disposePm();
    };
  }, [gl, scene, quality]);
  return failed ? <BrightFallback /> : null;
}
