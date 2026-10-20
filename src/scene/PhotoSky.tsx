import { useEffect, useState } from 'react';
import { useThree } from '@react-three/fiber';
import { BackSide, EquirectangularReflectionMapping, LinearSRGBColorSpace, PMREMGenerator, SRGBColorSpace, Texture, TextureLoader } from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import type { Quality } from '../game/storage';
import type { EnvironmentTheme } from './environment';
import { skyFallbackFile, skyFile, skyLook } from './locations';
import { notifyEnvironmentReady } from './openingIntro';

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Bright daytime fallback if a sky file fails. Not a location, and not fog. */
const SKY_FRAGMENT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float up = clamp(dir.y * 0.55 + 0.45, 0.0, 1.0);
    vec3 horizon = vec3(0.55, 0.78, 1.0);
    vec3 zenith = vec3(0.18, 0.48, 0.96);
    vec3 color = mix(horizon, zenith, pow(up, 0.75));
    vec3 sunDir = normalize(vec3(0.45, 0.72, 0.2));
    float sun = pow(max(dot(dir, sunDir), 0.0), 280.0);
    color += vec3(1.0, 0.86, 0.55) * sun * 1.4;
    gl_FragColor = vec4(color, 1.0);
  }
`;

function BrightFallback() {
  return (
    <mesh frustumCulled={false} renderOrder={-1}>
      <sphereGeometry args={[48, 24, 16]} />
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
 * Photographed sky and image light. High and medium use the HDR. Low uses the
 * smaller tone-mapped JPEG so older phones skip the high-range file.
 */
export function PhotoSky({ theme, quality }: { theme: EnvironmentTheme; quality: Quality }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const [texture, setTexture] = useState<Texture | null>(null);
  const [failed, setFailed] = useState(false);
  const low = quality === 'low';
  const look = skyLook(theme);

  useEffect(() => {
    let alive = true;
    let pmDisposed = false;
    let hdr: Texture | null = null;
    let env: Texture | null = null;
    const pm = new PMREMGenerator(gl);
    const disposePm = () => {
      if (pmDisposed) return;
      pmDisposed = true;
      pm.dispose();
    };
    const apply = (loaded: Texture, jpeg: boolean) => {
      if (!alive) {
        loaded.dispose();
        disposePm();
        return;
      }
      loaded.mapping = EquirectangularReflectionMapping;
      if (jpeg) loaded.colorSpace = SRGBColorSpace;
      else loaded.colorSpace = LinearSRGBColorSpace;
      hdr = loaded;
      env = pm.fromEquirectangular(loaded).texture;
      scene.environment = env;
      scene.environmentIntensity = look.env;
      scene.environmentRotation.set(look.pitch, look.yaw, 0);
      scene.background = loaded;
      scene.backgroundBlurriness = 0;
      scene.backgroundIntensity = jpeg ? 1 : look.intensity;
      scene.backgroundRotation.set(look.pitch, look.yaw, 0);
      disposePm();
      setTexture(loaded);
      setFailed(false);
      notifyEnvironmentReady();
    };
    const fail = () => {
      if (!alive) return;
      disposePm();
      setFailed(true);
      notifyEnvironmentReady();
    };
    const url = skyFile(theme, quality);
    if (low) {
      new TextureLoader().load(url, (loaded) => apply(loaded, true), undefined, fail);
    } else {
      new HDRLoader().load(url, (loaded) => apply(loaded, false), undefined, () => {
        new TextureLoader().load(skyFallbackFile(theme), (loaded) => apply(loaded, true), undefined, fail);
      });
    }
    return () => {
      alive = false;
      scene.environment = null;
      scene.background = null;
      env?.dispose();
      hdr?.dispose();
      disposePm();
      setTexture(null);
    };
  }, [gl, scene, theme, quality, low, look.env, look.intensity, look.pitch, look.yaw]);

  if (failed || !texture) return <BrightFallback />;
  return null;
}
