import { Component, Suspense, useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { useGLTF, useTexture } from '@react-three/drei';
import {
  CanvasTexture,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { Quality } from '../game/storage';
import { DRACO_DECODER_PATH } from './decoders';
import {
  ALLEY_FLOOR_TINT,
  ALLEY_MURAL,
  ALLEY_OFFSET,
  ALLEY_WORDMARK,
  alleyModelUrl,
  alleyUrl,
} from './alleyLayout';
import { PITCH_PLANE, fillPitch, pitchPlaneGeometry, pitchTextureSize } from './alleyPitch';

class AlleyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn('Alley unavailable; using the concrete pad.', error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function ConcretePad() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[18, 18]} />
      <meshStandardMaterial color="#8a8d90" roughness={0.92} metalness={0} />
    </mesh>
  );
}

function prepareAlley(root: Object3D, shadows: boolean) {
  root.traverse((object) => {
    const mesh = object as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const floor = materials.some((material) => material.name === 'StreetConcrete') || mesh.name === 'StreetFloor' || mesh.name === 'Floor';
    const transparent = materials.some((material) => (material as Material & { transparent?: boolean }).transparent);
    mesh.castShadow = shadows && !floor && !transparent;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    materials.forEach((material) => {
      const mat = material as MeshStandardMaterial;
      mat.fog = false;
      if (floor) {
        mat.color.set(ALLEY_FLOOR_TINT);
        mat.envMapIntensity = 0.16;
        mat.roughness = Math.max(mat.roughness, 0.86);
      } else if (typeof mat.envMapIntensity === 'number') {
        mat.envMapIntensity = 0.72;
      }
      mat.needsUpdate = true;
    });
  });
}

function AlleyModel({ quality, shadows }: { quality: Quality; shadows: boolean }) {
  const url = alleyModelUrl(quality);
  const { scene } = useGLTF(url, DRACO_DECODER_PATH);
  useLayoutEffect(() => {
    prepareAlley(scene, shadows);
  }, [scene, shadows]);
  return (
    <group position={[ALLEY_OFFSET.x, ALLEY_OFFSET.y, ALLEY_OFFSET.z]}>
      <primitive object={scene} dispose={null} />
    </group>
  );
}

function posterTexture(warm: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('poster');
  ctx.fillStyle = '#f3eee4';
  ctx.fillRect(0, 0, 256, 360);
  ctx.fillStyle = warm ? '#c4493a' : '#1f5f78';
  ctx.fillRect(18, 22, 220, 78);
  ctx.fillStyle = '#2c2a28';
  for (let i = 0; i < 7; i++) ctx.fillRect(22, 128 + i * 26, 196 - (i % 3) * 28, 9);
  ctx.fillStyle = warm ? '#e2b33a' : '#d06a3a';
  ctx.fillRect(22, 312, 96, 28);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Two wheatpaste sheets on the back brick, in front of the wall face. */
function Posters() {
  const textures = useMemo(() => [posterTexture(true), posterTexture(false)], []);
  useEffect(() => () => { textures.forEach((texture) => texture.dispose()); }, [textures]);
  const spots = [
    { position: [-3.35, 1.7, -7.02] as const, rotation: [0, 0.02, -0.03] as const },
    { position: [2.9, 1.55, -7.02] as const, rotation: [0, -0.03, 0.02] as const },
  ];
  return (
    <group>
      {spots.map((spot, index) => (
        <mesh key={index} position={spot.position} rotation={spot.rotation} castShadow>
          <planeGeometry args={[0.62, 0.86]} />
          <meshStandardMaterial map={textures[index]} roughness={0.82} metalness={0} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * Spray the wordmark into the brick: the letters stay, the mortar and chips
 * let the wall show through, and a lit standard material takes the sun.
 */
function paintMural(image: CanvasImageSource): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 368;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('mural');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = pixels.data;
  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const i = (y * canvas.width + x) * 4;
      const ink = (data[i + 3] ?? 0) / 255;
      if (ink < 0.04) {
        data[i + 3] = 0;
        continue;
      }
      const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const grit = 0.94 + 0.06 * (n - Math.floor(n));
      const chip = Math.sin(x * 0.37 + y * 1.91) * 43758.5453;
      const pit = chip - Math.floor(chip) < 0.045 ? 0.55 : 1;
      data[i + 3] = Math.round(ink * 0.92 * grit * pit * 255);
    }
  }
  ctx.putImageData(pixels, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}

function WallMural() {
  const source = useTexture(alleyUrl(ALLEY_WORDMARK));
  const map = useMemo(() => paintMural(source.image as CanvasImageSource), [source]);
  useEffect(() => () => { map.dispose(); }, [map]);
  return (
    <mesh position={ALLEY_MURAL.position} receiveShadow>
      <planeGeometry args={[ALLEY_MURAL.size[0], ALLEY_MURAL.size[1]]} />
      <meshStandardMaterial
        map={map}
        transparent
        roughness={0.84}
        metalness={0}
        envMapIntensity={0.35}
        polygonOffset
        polygonOffsetFactor={-1}
        depthWrite={false}
      />
    </mesh>
  );
}

class MuralBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** One baked decal. The concrete shows through the chips, and the sun lights the paint. */
function AlleyPitch({ quality }: { quality: Quality }) {
  const texture = useMemo(() => {
    const size = pitchTextureSize(quality);
    const spanX = PITCH_PLANE.x1 - PITCH_PLANE.x0;
    const spanZ = PITCH_PLANE.z1 - PITCH_PLANE.z0;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = Math.round(size * (spanZ / spanX));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('pitch');
    const pixels = fillPitch(canvas.width, canvas.height);
    const image = ctx.createImageData(canvas.width, canvas.height);
    image.data.set(pixels);
    ctx.putImageData(image, 0, 0);
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    map.anisotropy = quality === 'high' ? 8 : 4;
    map.needsUpdate = true;
    return map;
  }, [quality]);
  const geometry = useMemo(() => pitchPlaneGeometry(), []);
  useEffect(() => () => {
    texture.dispose();
    geometry.dispose();
  }, [texture, geometry]);
  return (
    <mesh geometry={geometry} receiveShadow renderOrder={2}>
      <meshStandardMaterial
        map={texture}
        roughness={0.94}
        metalness={0}
        envMapIntensity={0.16}
        transparent
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-4}
        polygonOffsetUnits={-8}
      />
    </mesh>
  );
}

export function AlleyCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const url = alleyModelUrl(quality);
  return (
    <group>
      <Posters />
      <MuralBoundary>
        <Suspense fallback={null}>
          <WallMural />
        </Suspense>
      </MuralBoundary>
      <AlleyBoundary key={url} fallback={<ConcretePad />}>
        <Suspense fallback={<ConcretePad />}>
          <AlleyModel quality={quality} shadows={shadows} />
        </Suspense>
      </AlleyBoundary>
      <AlleyPitch quality={quality} />
    </group>
  );
}
