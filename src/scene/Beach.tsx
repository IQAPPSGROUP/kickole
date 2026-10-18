import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three';
import type { Quality } from '../game/storage';

function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function makeCanvas(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function useSandTexture() {
  return useMemo(() => {
    const t = makeCanvas(512, (g, n) => {
      const random = seededRandom(17);
      const wash = g.createLinearGradient(0, 0, 0, n);
      wash.addColorStop(0, '#d7b56a');
      wash.addColorStop(0.45, '#e8c98a');
      wash.addColorStop(1, '#f3ddb0');
      g.fillStyle = wash;
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 28; i++) {
        g.fillStyle = random() > 0.5 ? 'rgba(255,236,190,0.16)' : 'rgba(150,96,40,0.08)';
        g.beginPath();
        g.ellipse(random() * n, random() * n, 18 + random() * 40, 8 + random() * 16, random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = random() > 0.6 ? 'rgba(255,248,220,0.28)' : 'rgba(110,70,28,0.16)';
        g.fillRect(random() * n, random() * n, 1 + random() * 2, 1 + random() * 2);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }, []);
}

function useSkyTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 512;
    const g = c.getContext('2d');
    if (g) {
      const wash = g.createLinearGradient(0, 0, 0, 512);
      wash.addColorStop(0, '#3aa0dc');
      wash.addColorStop(0.42, '#8fd4f2');
      wash.addColorStop(0.72, '#f6e2b4');
      wash.addColorStop(1, '#1a8fb0');
      g.fillStyle = wash;
      g.fillRect(0, 0, 16, 512);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
}

function useWaterTexture() {
  return useMemo(() => {
    const t = makeCanvas(256, (g, n) => {
      const gradient = g.createLinearGradient(0, 0, 0, n);
      gradient.addColorStop(0, '#3ec0d8');
      gradient.addColorStop(0.45, '#178fb8');
      gradient.addColorStop(1, '#0b5678');
      g.fillStyle = gradient;
      g.fillRect(0, 0, n, n);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      for (let y = 30; y < n; y += 28) {
        g.beginPath();
        for (let x = 0; x <= n; x += 8) {
          const wave = y + Math.sin(x / 18) * 4;
          if (x === 0) g.moveTo(x, wave); else g.lineTo(x, wave);
        }
        g.stroke();
      }
    });
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(6, 2);
    return t;
  }, []);
}

function Palm({ x, z, lean = 0.12, scale = 1, leaves = 7 }: { x: number; z: number; lean?: number; scale?: number; leaves?: number }) {
  const crown = Array.from({ length: leaves }, (_, i) => (i / leaves) * Math.PI * 2);
  return (
    <group position={[x, 0, z]} rotation={[lean, 0, lean * 0.4]} scale={scale}>
      <mesh position={[0.05, 1.35, 0]} rotation={[0, 0, 0.06]} castShadow>
        <cylinderGeometry args={[0.06, 0.12, 2.7, 6]} />
        <meshStandardMaterial color="#6d4a2c" roughness={0.9} />
      </mesh>
      {crown.map((angle, i) => (
        <mesh key={angle} position={[Math.sin(angle) * 0.55, 2.7, Math.cos(angle) * 0.28]} rotation={[1.05, angle, 0.2]}>
          <boxGeometry args={[0.22, 0.03, 1.15]} />
          <meshStandardMaterial color={i % 2 ? '#147a3c' : '#3cba6a'} roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0.12, 2.35, 0.08]}>
        <sphereGeometry args={[0.08, 8, 6]} />
        <meshStandardMaterial color="#6a4a28" roughness={0.8} />
      </mesh>
    </group>
  );
}

function Umbrella({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.9, 6]} />
        <meshStandardMaterial color="#f7f5ed" />
      </mesh>
      <mesh position={[0, 1.82, 0]} castShadow>
        <coneGeometry args={[0.9, 0.36, 8]} />
        <meshStandardMaterial color="#1FA85A" roughness={0.6} />
      </mesh>
      <mesh position={[0, 1.78, 0]}>
        <coneGeometry args={[0.52, 0.22, 8]} />
        <meshStandardMaterial color="#F5C94D" roughness={0.55} />
      </mesh>
    </group>
  );
}

/** Green cloth with a yellow diamond: beach colours, not a detailed national emblem. */
function Pennant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 2.3, 5]} />
        <meshStandardMaterial color="#f4efe4" />
      </mesh>
      <mesh position={[0.42, 2.05, 0]}>
        <boxGeometry args={[0.78, 0.46, 0.02]} />
        <meshStandardMaterial color="#1FA85A" />
      </mesh>
      <mesh position={[0.42, 2.05, 0.02]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.24, 0.24, 0.02]} />
        <meshStandardMaterial color="#F5C94D" />
      </mesh>
    </group>
  );
}

function Barraca({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 1.1, 0.85]} />
        <meshStandardMaterial color="#f6f1e6" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.22, 0.2]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 0.08, 1.15]} />
        <meshStandardMaterial color="#F5C94D" />
      </mesh>
      <mesh position={[0, 1.3, 0.28]} rotation={[0.4, 0, 0]}>
        <boxGeometry args={[1.8, 0.07, 0.32]} />
        <meshStandardMaterial color="#1FA85A" />
      </mesh>
    </group>
  );
}

function Waves() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.position.z = -4.15 - i * 0.62 + Math.sin(t * 0.9 + i * 1.3) * 0.15;
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -4.2 - i * 0.6]}>
          <planeGeometry args={[18, 0.07]} />
          <meshBasicMaterial color={i % 2 ? '#f7f5ed' : '#d8f7ff'} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

/** Open sand pitch with the sea behind the player. Props stay outside the kick circle. */
export function Beach({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const sand = useSandTexture();
  const water = useWaterTexture();
  const sky = useSkyTexture();
  const sea = useRef<Mesh>(null);
  const leaves = quality === 'low' ? 5 : 7;
  useEffect(() => () => { sand.dispose(); water.dispose(); sky.dispose(); }, [sand, water, sky]);
  useFrame(({ clock }) => {
    const material = sea.current?.material;
    if (quality === 'low' || !(material instanceof MeshStandardMaterial) || !material.map) return;
    material.map.offset.x = clock.elapsedTime * 0.04;
  });
  return (
    <group>
      <mesh position={[0, 5.2, -14.2]}>
        <planeGeometry args={[42, 16]} />
        <meshBasicMaterial map={sky} />
      </mesh>
      <mesh position={[-6.5, 1.6, -12.2]} scale={[2.2, 1.5, 1.4]}>
        <sphereGeometry args={[1.1, 12, 10]} />
        <meshStandardMaterial color="#2f6a45" roughness={1} />
      </mesh>
      <mesh position={[7.2, 2.4, -12.6]} scale={[1.5, 2.2, 1.3]}>
        <sphereGeometry args={[1.15, 12, 10]} />
        <meshStandardMaterial color="#24563a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.4]} receiveShadow={shadows}>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial map={sand} color="#f3d7a4" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -3.5]} receiveShadow={shadows}>
        <planeGeometry args={[22, 2.4]} />
        <meshStandardMaterial color="#b99462" roughness={0.55} metalness={0.04} />
      </mesh>
      <mesh ref={sea} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -9.2]}>
        <planeGeometry args={[36, 14]} />
        <meshStandardMaterial map={water} color="#ffffff" roughness={quality === 'high' ? 0.12 : 0.28} metalness={quality === 'low' ? 0.08 : 0.28} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4.15]}>
        <planeGeometry args={[20, 0.55]} />
        <meshBasicMaterial color="#f7f5ed" transparent opacity={0.55} />
      </mesh>
      <mesh position={[5.2, 6.2, -10]}>
        <sphereGeometry args={[0.85, quality === 'low' ? 10 : 20, quality === 'low' ? 10 : 16]} />
        <meshBasicMaterial color="#ffe56a" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.15, 1.22, 48]} />
        <meshBasicMaterial color="#fff6df" />
      </mesh>
      <Waves />
      <Palm x={-3.6} z={-2.2} lean={0.08} leaves={leaves} />
      <Palm x={3.5} z={-1.6} lean={-0.1} scale={0.92} leaves={leaves} />
      <Palm x={-4.6} z={1.2} lean={0.16} scale={0.8} leaves={leaves} />
      <Umbrella x={2.7} z={-2.7} />
      <Barraca x={-2.9} z={-3.05} />
      <Pennant x={1.7} z={-2.55} />
      <mesh position={[-5.2, -0.15, 1.4]} scale={[2.4, 0.45, 1.6]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#efd3a2" roughness={1} />
      </mesh>
      <mesh position={[5.4, -0.2, -0.4]} scale={[2.2, 0.4, 1.8]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#e8c48a" roughness={1} />
      </mesh>
    </group>
  );
}
