import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, DoubleSide, InstancedMesh, NoColorSpace, Object3D, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Quality } from '../game/storage';
import {
  BEACH_BUNTING_COUNT,
  BEACH_FESTA,
  BEACH_FLAG_X,
  BEACH_STREAMER_COUNT,
  beachBuntingSpot,
  beachFlagSpot,
  beachPoleSpot,
  beachStreamerSpot,
} from './beachCarnival';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { createPennantGeometry, placeRope } from './pennant';
import { prefersReducedMotion, sceneLifeBudget } from './juice';

/** Pennants behind the rope line. The beach GLB stays the scenery. */
function BeachCarnival({ sway }: { sway: boolean }) {
  const buntingRef = useRef<InstancedMesh>(null);
  const ropeRef = useRef<InstancedMesh>(null);
  const flagRef = useRef<InstancedMesh>(null);
  const poleRef = useRef<InstancedMesh>(null);
  const streamerRef = useRef<InstancedMesh>(null);
  const buntingGeo = useMemo(() => createPennantGeometry(), []);
  const flagGeo = useMemo(() => createPennantGeometry(), []);
  useEffect(() => () => {
    buntingGeo.dispose();
    flagGeo.dispose();
  }, [buntingGeo, flagGeo]);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const paint = (time: number, colors: boolean) => {
    const flutter = (u: number) => (sway ? Math.sin(time * 2.1 + u * 7) * 0.07 : 0);
    const bunting = buntingRef.current;
    if (bunting) {
      for (let i = 0; i < BEACH_BUNTING_COUNT; i++) {
        const u = i / (BEACH_BUNTING_COUNT - 1);
        const spot = beachBuntingSpot(i, flutter(u));
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(flutter(u) * 0.5, 0, flutter(u));
        dummy.scale.set(1.05, 1.05, 1);
        dummy.updateMatrix();
        bunting.setMatrixAt(i, dummy.matrix);
        if (colors) bunting.setColorAt(i, tint.set(BEACH_FESTA[i % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
      bunting.instanceMatrix.needsUpdate = true;
      if (colors && bunting.instanceColor) bunting.instanceColor.needsUpdate = true;
      const rope = ropeRef.current;
      if (rope) {
        for (let i = 0; i < BEACH_BUNTING_COUNT - 1; i++) {
          const a = beachBuntingSpot(i, flutter(i / (BEACH_BUNTING_COUNT - 1)));
          const b = beachBuntingSpot(i + 1, flutter((i + 1) / (BEACH_BUNTING_COUNT - 1)));
          placeRope(dummy, a.x, a.y, a.z, b.x, b.y, b.z);
          rope.setMatrixAt(i, dummy.matrix);
        }
        rope.instanceMatrix.needsUpdate = true;
      }
    }
    BEACH_FLAG_X.forEach((_, i) => {
      const u = i / (BEACH_FLAG_X.length - 1);
      const pole = beachPoleSpot(i);
      if (poleRef.current) {
        dummy.position.set(pole.x, pole.y, pole.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poleRef.current.setMatrixAt(i, dummy.matrix);
      }
      if (flagRef.current) {
        const flag = beachFlagSpot(i, flutter(u));
        dummy.position.set(flag.x, flag.y, flag.z);
        dummy.rotation.set(0, 0.25, flutter(u) * 1.3);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        flagRef.current.setMatrixAt(i, dummy.matrix);
        if (colors) flagRef.current.setColorAt(i, tint.set(BEACH_FESTA[i % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
    });
    if (poleRef.current) poleRef.current.instanceMatrix.needsUpdate = true;
    if (flagRef.current) {
      flagRef.current.instanceMatrix.needsUpdate = true;
      if (colors && flagRef.current.instanceColor) flagRef.current.instanceColor.needsUpdate = true;
    }
    const streamers = streamerRef.current;
    if (streamers) {
      for (let i = 0; i < BEACH_STREAMER_COUNT; i++) {
        const u = i / (BEACH_STREAMER_COUNT - 1);
        const spot = beachStreamerSpot(i, flutter(u));
        dummy.position.set(spot.x, spot.y, spot.z);
        dummy.rotation.set(flutter(u), 0, flutter(u));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        streamers.setMatrixAt(i, dummy.matrix);
        if (colors) streamers.setColorAt(i, tint.set(BEACH_FESTA[(i + 3) % BEACH_FESTA.length] ?? BEACH_FESTA[0]));
      }
      streamers.instanceMatrix.needsUpdate = true;
      if (colors && streamers.instanceColor) streamers.instanceColor.needsUpdate = true;
    }
  };
  useLayoutEffect(() => { paint(0, true); }, []);
  useFrame((state) => { if (sway) paint(state.clock.elapsedTime, false); });
  return (
    <group>
      <instancedMesh ref={ropeRef} args={[undefined, undefined, BEACH_BUNTING_COUNT - 1]} frustumCulled={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={buntingRef} args={[undefined, undefined, BEACH_BUNTING_COUNT]} frustumCulled={false}>
        <primitive object={buntingGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.48} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, BEACH_FLAG_X.length]} frustumCulled={false}>
        <cylinderGeometry args={[0.02, 0.028, 2.5, 6]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={flagRef} args={[undefined, undefined, BEACH_FLAG_X.length]} frustumCulled={false}>
        <primitive object={flagGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.45} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={streamerRef} args={[undefined, undefined, BEACH_STREAMER_COUNT]} frustumCulled={false}>
        <planeGeometry args={[0.07, 0.72]} />
        <meshStandardMaterial side={DoubleSide} roughness={0.45} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/** Beige-gold sand. The material colour stays white so this albedo is not multiplied back into clay. */
const SAND_BASE = '#e4c486';

function useSand() {
  return useMemo(() => {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const normalCanvas = document.createElement('canvas');
    normalCanvas.width = normalCanvas.height = size;
    const g = canvas.getContext('2d');
    const ng = normalCanvas.getContext('2d');
    let seed = 20261020;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    if (g && ng) {
      g.fillStyle = SAND_BASE;
      g.fillRect(0, 0, size, size);
      for (let i = 0; i < 18; i++) {
        const x = random() * size;
        const y = random() * size;
        const rad = 36 + random() * 78;
        const shade = g.createRadialGradient(x, y, rad * 0.15, x, y, rad);
        shade.addColorStop(0, 'rgba(168, 128, 72, 0.20)');
        shade.addColorStop(1, 'rgba(168, 128, 72, 0)');
        g.fillStyle = shade;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 12; i++) {
        const x = random() * size;
        const y = random() * size;
        const rad = 24 + random() * 46;
        const shade = g.createRadialGradient(x, y, 0, x, y, rad);
        shade.addColorStop(0, 'rgba(236, 214, 168, 0.28)');
        shade.addColorStop(1, 'rgba(236, 214, 168, 0)');
        g.fillStyle = shade;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 14000; i++) {
        g.fillStyle = random() > 0.46 ? 'rgba(244, 226, 176, 0.34)' : 'rgba(156, 116, 62, 0.26)';
        g.fillRect(random() * size, random() * size, 1 + random() * 1.5, 1 + random() * 1.5);
      }
      for (let row = 0; row < 16; row++) {
        g.strokeStyle = 'rgba(150, 114, 62, 0.11)';
        g.lineWidth = 1.5;
        g.beginPath();
        for (let x = 0; x <= size; x += 3) {
          const y = row * (size / 16) + Math.sin(x / 24 + row * 1.6) * 5;
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke();
      }
      const stamp = (x: number, y: number, angle: number) => {
        g.save();
        g.translate(x, y);
        g.rotate(angle);
        g.fillStyle = 'rgba(124, 92, 48, 0.30)';
        g.beginPath();
        g.ellipse(0, 7, 5.5, 8, 0, 0, Math.PI * 2);
        g.fill();
        g.beginPath();
        g.ellipse(0, -9, 6.4, 9, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      };
      for (let i = 0; i < 6; i++) {
        const x = 48 + random() * (size - 96);
        const y = 48 + random() * (size - 96);
        const angle = random() * Math.PI * 2;
        stamp(x, y, angle);
        stamp(x + Math.cos(angle + 1.15) * 24, y + Math.sin(angle + 1.15) * 24, angle + 0.12);
      }
      const painted = g.getImageData(0, 0, size, size);
      const height = new Float32Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4;
          const luma = (painted.data[i] * 0.3 + painted.data[i + 1] * 0.5 + painted.data[i + 2] * 0.2) / 255;
          const ripple = Math.sin(x * 0.08 + y * 0.018) * 0.34 + Math.sin(x * 0.028 - y * 0.09 + 1.1) * 0.24;
          height[y * size + x] = (luma - 0.74) * 1.6 + ripple;
        }
      }
      const pixels = ng.createImageData(size, size);
      const slope = 2.6;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const xm = height[y * size + ((x + size - 1) % size)];
          const xp = height[y * size + ((x + 1) % size)];
          const ym = height[((y + size - 1) % size) * size + x];
          const yp = height[((y + 1) % size) * size + x];
          let nx = (xm - xp) * slope;
          let ny = (ym - yp) * slope;
          let nz = 1;
          const len = Math.hypot(nx, ny, nz) || 1;
          nx /= len;
          ny /= len;
          nz /= len;
          const o = (y * size + x) * 4;
          pixels.data[o] = Math.round((nx * 0.5 + 0.5) * 255);
          pixels.data[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
          pixels.data[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
          pixels.data[o + 3] = 255;
        }
      }
      ng.putImageData(pixels, 0, 0);
    }
    const color = new CanvasTexture(canvas);
    color.colorSpace = SRGBColorSpace;
    color.wrapS = color.wrapT = RepeatWrapping;
    color.repeat.set(4, 4);
    color.anisotropy = 4;
    const normal = new CanvasTexture(normalCanvas);
    normal.colorSpace = NoColorSpace;
    normal.wrapS = normal.wrapT = RepeatWrapping;
    normal.repeat.set(4, 4);
    normal.anisotropy = 4;
    return { color, normal };
  }, []);
}

/** Remains playable if the detailed beach GLB is missing or cannot decode. */
function BeachFallback() {
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.12, -22]}>
      <planeGeometry args={[45, 29]} /><meshStandardMaterial color="#1576d8" roughness={0.32} metalness={0.06} />
    </mesh>
    {[-1.5, 1.5].map(x => <mesh key={x} position={[x, .92, -5.35]}>
      <cylinderGeometry args={[.05, .05, 1.84, 8]} /><meshStandardMaterial color="#f6e8c7" />
    </mesh>)}
    <mesh position={[0, 1.84, -5.35]}><boxGeometry args={[3.1, .09, .09]} /><meshStandardMaterial color="#f6e8c7" /></mesh>
  </group>;
}

/** Visual replacement only: the simulation and player floor remain at their original coordinates. */
export function BeachCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const sand = useSand();
  useEffect(() => () => {
    sand.color.dispose();
    sand.normal.dispose();
  }, [sand]);
  return <group>
    <EnvironmentBackdrop quality={quality} theme="beach" fallback={<BeachFallback />} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, -16]} receiveShadow={shadows}>
      <planeGeometry args={[42, 24]} />
      <meshStandardMaterial color="#1576d8" roughness={0.28} metalness={0.08} envMapIntensity={0.45} />
    </mesh>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.9]} receiveShadow={shadows}>
      <planeGeometry args={[16, 10.6]} />
      <meshStandardMaterial
        map={sand.color}
        normalMap={sand.normal}
        normalScale={[0.62, 0.62]}
        color="#ffffff"
        roughness={0.94}
        metalness={0}
        envMapIntensity={0.12}
      />
    </mesh>
    <BeachCarnival sway={sceneLifeBudget(quality, prefersReducedMotion()).buntingSway} />
    {/* Freestyle circle and touch-area boundary ropes are cosmetic, with no colliders. */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .012, 0]}>
      <torusGeometry args={[1.2, .014, 5, quality === 'low' ? 40 : 72]} /><meshStandardMaterial color="#f6e5b9" roughness={1} />
    </mesh>
    {[-3.4, 3.4].map(x => <group key={x}>
      <mesh position={[x, .014, 0]}><boxGeometry args={[.028, .028, 8.8]} /><meshStandardMaterial color="#f7e8c4" /></mesh>
      {[-4.4, 4.4].map(z => <mesh key={z} position={[x, .06, z]}>
        <cylinderGeometry args={[.035, .045, .12, 6]} /><meshStandardMaterial color="#997d55" />
      </mesh>)}
    </group>)}
    {[-4.4, 4.4].map(z => <mesh key={z} position={[0, .014, z]}><boxGeometry args={[6.8, .028, .028]} /><meshStandardMaterial color="#f7e8c4" /></mesh>)}
  </group>;
}
