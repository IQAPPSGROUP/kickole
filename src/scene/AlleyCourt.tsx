import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import {
  CanvasTexture,
  Color,
  DoubleSide,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { Quality } from '../game/storage';
import { DRACO_DECODER_PATH } from './decoders';
import { prefersReducedMotion, sceneLifeBudget } from './juice';
import { notifyEnvironmentReady } from './openingIntro';
import { createPennantGeometry, placeRope } from './pennant';
import {
  ALLEY_BUNTING,
  ALLEY_FLOOR_TINT,
  ALLEY_OFFSET,
  alleyModelUrl,
} from './alleyLayout';

const FESTA = ['#d64545', '#e6b325', '#3aa6a0', '#f4f0e6', '#e07a3d', '#3d6ea8'];

class AlleyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) {
    console.warn('Alley unavailable; using the concrete pad.', error);
    notifyEnvironmentReady();
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
    notifyEnvironmentReady();
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
    { position: [-1.55, 1.72, -6.9] as const, rotation: [0, 0.04, -0.03] as const },
    { position: [0.35, 1.58, -6.9] as const, rotation: [0, -0.05, 0.02] as const },
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

/** Cloth pennants on a sagging cord. Above the play box, across the alley. */
function Bunting({ sway }: { sway: boolean }) {
  const count = ALLEY_BUNTING.reduce((sum, row) => sum + row.count, 0);
  const ropes = count - ALLEY_BUNTING.length;
  const buntingRef = useRef<InstancedMesh>(null);
  const ropeRef = useRef<InstancedMesh>(null);
  const geo = useMemo(() => createPennantGeometry(), []);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  useEffect(() => () => { geo.dispose(); }, [geo]);
  const paint = (time: number, colors: boolean) => {
    const flags = buntingRef.current;
    const rope = ropeRef.current;
    if (!flags) return;
    let flag = 0;
    let span = 0;
    ALLEY_BUNTING.forEach((row) => {
      for (let i = 0; i < row.count; i++) {
        const u = row.count === 1 ? 0.5 : i / (row.count - 1);
        const flutter = sway ? Math.sin(time * 1.8 + u * 8 + row.z) * 0.05 : 0;
        const x = row.x0 + u * (row.x1 - row.x0);
        const y = row.y - Math.sin(u * Math.PI) * 0.42 + flutter;
        dummy.position.set(x, y, row.z);
        dummy.rotation.set(flutter * 0.5, 0, flutter);
        dummy.scale.set(1.05, 1.05, 1);
        dummy.updateMatrix();
        flags.setMatrixAt(flag, dummy.matrix);
        if (colors) flags.setColorAt(flag, tint.set(FESTA[flag % FESTA.length] ?? FESTA[0]));
        if (rope && i > 0) {
          const u0 = (i - 1) / (row.count - 1);
          const flutter0 = sway ? Math.sin(time * 1.8 + u0 * 8 + row.z) * 0.05 : 0;
          placeRope(
            dummy,
            row.x0 + u0 * (row.x1 - row.x0), row.y - Math.sin(u0 * Math.PI) * 0.42 + flutter0, row.z,
            x, y, row.z,
          );
          rope.setMatrixAt(span, dummy.matrix);
          span += 1;
        }
        flag += 1;
      }
    });
    flags.instanceMatrix.needsUpdate = true;
    if (colors && flags.instanceColor) flags.instanceColor.needsUpdate = true;
    if (rope) rope.instanceMatrix.needsUpdate = true;
  };
  useLayoutEffect(() => { paint(0, true); }, []);
  useFrame((state) => { if (sway) paint(state.clock.elapsedTime, false); });
  return (
    <group>
      <instancedMesh ref={ropeRef} args={[undefined, undefined, ropes]} frustumCulled={false}>
        <cylinderGeometry args={[0.01, 0.01, 1, 5]} />
        <meshStandardMaterial color="#d9d1c4" roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={buntingRef} args={[undefined, undefined, count]} frustumCulled={false}>
        <primitive object={geo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.55} metalness={0} />
      </instancedMesh>
    </group>
  );
}

export function AlleyCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const sway = sceneLifeBudget(quality, prefersReducedMotion()).buntingSway;
  const url = alleyModelUrl(quality);
  return (
    <group>
      <Bunting sway={sway} />
      <Posters />
      <AlleyBoundary key={url} fallback={<ConcretePad />}>
        <Suspense fallback={<ConcretePad />}>
          <AlleyModel quality={quality} shadows={shadows} />
        </Suspense>
      </AlleyBoundary>
    </group>
  );
}
