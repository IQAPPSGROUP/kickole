import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three';
import { beachBallPose, birdPose } from '../game/set-dressing';
import type { Quality } from '../game/storage';
import { ART, useArtTexture } from './art';
import { fx } from './fx';
import { Spectators } from './Spectators';

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
      for (let i = 0; i < 36; i++) {
        g.fillStyle = random() > 0.5 ? 'rgba(255,236,190,0.18)' : 'rgba(150,96,40,0.09)';
        g.beginPath();
        g.ellipse(random() * n, random() * n, 18 + random() * 48, 8 + random() * 18, random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 5600; i++) {
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
    c.width = 64;
    c.height = 512;
    const g = c.getContext('2d');
    if (g) {
      const wash = g.createLinearGradient(0, 0, 0, 512);
      wash.addColorStop(0, '#2f8fd4');
      wash.addColorStop(0.4, '#7ec8ef');
      wash.addColorStop(0.68, '#b8dff2');
      wash.addColorStop(0.86, '#d9eef6');
      wash.addColorStop(1, '#8ec8d4');
      g.fillStyle = wash;
      g.fillRect(0, 0, 64, 512);
      const random = seededRandom(41);
      for (let i = 0; i < 10; i++) {
        const y = 40 + random() * 180;
        const soft = g.createRadialGradient(32, y, 2, 32, y, 28 + random() * 20);
        soft.addColorStop(0, 'rgba(255,255,255,0.22)');
        soft.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = soft;
        g.fillRect(0, y - 40, 64, 80);
      }
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
      gradient.addColorStop(0, '#5ad0e4');
      gradient.addColorStop(0.28, '#2aa8c8');
      gradient.addColorStop(0.55, '#178fb8');
      gradient.addColorStop(1, '#0a4a68');
      g.fillStyle = gradient;
      g.fillRect(0, 0, n, n);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 2.5;
      for (let y = 22; y < n; y += 22) {
        g.beginPath();
        for (let x = 0; x <= n; x += 6) {
          const wave = y + Math.sin(x / 16 + y * 0.04) * 3.5;
          if (x === 0) g.moveTo(x, wave); else g.lineTo(x, wave);
        }
        g.stroke();
      }
      g.strokeStyle = 'rgba(210,255,255,0.18)';
      g.lineWidth = 1.5;
      for (let y = 34; y < n; y += 36) {
        g.beginPath();
        for (let x = 0; x <= n; x += 8) {
          const wave = y + Math.cos(x / 22) * 2.2;
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

/** Layered green headlands framing the sea — gap kept around the sun; right side stays a low terrace for houses. */
function CoastalHills({ quality }: { quality: Quality }) {
  const segments = quality === 'low' ? 10 : 16;
  const mounds: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; color: string }> = [
    { x: -7.6, y: 0.95, z: -7.8, sx: 2.1, sy: 1.15, sz: 1.3, color: '#2f6a45' },
    { x: -2.8, y: 1.1, z: -7.7, sx: 1.6, sy: 1.15, sz: 1.2, color: '#24563a' },
    { x: 5.8, y: 1.0, z: -7.5, sx: 1.7, sy: 1.1, sz: 1.15, color: '#275c3d' },
  ];
  if (quality !== 'low') {
    mounds.push(
      { x: -1.6, y: 0.45, z: -6.9, sx: 1.05, sy: 0.5, sz: 0.9, color: '#3a7a4f' },
      { x: -8.2, y: 1.5, z: -8.2, sx: 1.35, sy: 0.95, sz: 1.05, color: '#1f4d32' },
      { x: 6.6, y: 1.6, z: -8.0, sx: 1.1, sy: 0.85, sz: 0.95, color: '#214f34' },
    );
  }
  return (
    <group>
      {mounds.map((m, i) => (
        <mesh key={i} position={[m.x, m.y, m.z]} scale={[m.sx, m.sy, m.sz]}>
          <sphereGeometry args={[1.05, segments, Math.max(8, segments - 4)]} />
          <meshStandardMaterial color={m.color} roughness={1} />
        </mesh>
      ))}
      {/* Flat green terrace the coastal houses sit on — pulled forward into the phone frame. */}
      <mesh position={[2.0, 0.75, -5.75]} rotation={[-0.08, 0.06, 0]}>
        <boxGeometry args={[4.4, 0.45, 1.4]} />
        <meshStandardMaterial color="#2d6844" roughness={1} fog={false} />
      </mesh>
      <mesh position={[2.2, 1.2, -6.2]} rotation={[-0.06, 0.05, 0]}>
        <boxGeometry args={[3.8, 0.35, 1.0]} />
        <meshStandardMaterial color="#24563a" roughness={1} fog={false} />
      </mesh>
    </group>
  );
}

/**
 * Sparse coastal houses perched on the right headland (elevated y so they sit on the hill, not under it).
 * Same visual language as the rua hillside; left/sun pocket stays open.
 */
function CoastalNeighbourhood({ quality }: { quality: Quality }) {
  const buildings = useMemo(() => {
    const random = seededRandom(2004);
    // Deeper than cream so faces don't read as a blank white billboard in the phone frame.
    const palette = ['#D4894F', '#C45A52', '#D4A85A', '#4F9A8C', '#6A8FA0', '#A66F9A', '#C4A070'];
    const count = quality === 'low' ? 8 : 12;
    return Array.from({ length: count }, (_, i) => {
      const row = i < (quality === 'low' ? 5 : 7) ? 0 : 1;
      const index = row === 0 ? i : i - (quality === 'low' ? 5 : 7);
      const x = 0.85 + index * (row === 0 ? 0.62 : 0.72) + random() * 0.04;
      const z = row === 0 ? -5.4 - random() * 0.1 : -5.9 - random() * 0.12;
      const baseY = row === 0 ? 0.9 + random() * 0.06 : 1.55 + random() * 0.1;
      const width = 0.58 + random() * 0.28;
      const height = (row === 0 ? 1.15 : 1.4) + random() * 0.65;
      const depth = 0.45 + random() * 0.22;
      return {
        x,
        y: baseY,
        z,
        width,
        height,
        depth,
        color: palette[i % palette.length],
        roof: i % 3 === 0,
        balcony: quality !== 'low' && i % 4 === 0,
        tank: quality !== 'low' && i % 5 === 0,
        laundry: quality !== 'low' && i % 3 === 1,
      };
    });
  }, [quality]);
  return (
    <group>
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, b.y, b.z]}>
          <mesh position={[0, b.height / 2, 0]}>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshBasicMaterial color={b.color} fog={false} />
          </mesh>
          <mesh position={[0, b.height + 0.04, 0]}>
            <boxGeometry args={[b.width + 0.08, 0.08, b.depth + 0.08]} />
            <meshBasicMaterial color="#BFA888" fog={false} />
          </mesh>
          {[-0.16, 0.16].map((u, k) => (
            <mesh key={k} position={[u * b.width, b.height * 0.58, b.depth / 2 + 0.006]}>
              <planeGeometry args={[0.09, 0.14]} />
              <meshBasicMaterial color="#1e3540" fog={false} />
            </mesh>
          ))}
          {b.roof && (
            <mesh position={[b.width * 0.18, b.height + 0.16, 0]}>
              <boxGeometry args={[0.06, 0.22, 0.06]} />
              <meshBasicMaterial color="#3A454E" fog={false} />
            </mesh>
          )}
          {b.balcony && (
            <mesh position={[0, b.height * 0.4, b.depth / 2 + 0.07]}>
              <boxGeometry args={[b.width * 0.7, 0.045, 0.14]} />
              <meshBasicMaterial color="#C9B896" fog={false} />
            </mesh>
          )}
          {b.tank && (
            <mesh position={[-b.width * 0.16, b.height + 0.18, 0]}>
              <cylinderGeometry args={[0.1, 0.11, 0.24, 7]} />
              <meshBasicMaterial color="#1C2C33" fog={false} />
            </mesh>
          )}
          {b.laundry && (
            <group position={[0, b.height * 0.4 + 0.12, b.depth / 2 + 0.09]}>
              <mesh rotation={[0.18, 0, 0]}>
                <boxGeometry args={[b.width * 0.78, 0.025, 0.18]} />
                <meshBasicMaterial color={i % 2 ? '#D4A85A' : '#C45A52'} fog={false} />
              </mesh>
              {[-0.14, 0.14].map((u, j) => (
                <mesh key={j} position={[u * b.width, -0.11, 0.09]}>
                  <planeGeometry args={[0.1, 0.16]} />
                  <meshBasicMaterial color={['#E8D9B0', '#4F9A8C'][j]} side={DoubleSide} fog={false} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

function Palm({
  x, z, lean = 0.12, scale = 1, leaves = 7, frond,
}: {
  x: number; z: number; lean?: number; scale?: number; leaves?: number; frond: CanvasTexture | null;
}) {
  const crown = Array.from({ length: leaves }, (_, i) => (i / leaves) * Math.PI * 2);
  return (
    <group position={[x, 0, z]} rotation={[lean, 0, lean * 0.4]} scale={scale}>
      <mesh position={[0.04, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.15, 1.1, 8]} />
        <meshStandardMaterial color="#6b4228" roughness={0.9} />
      </mesh>
      <mesh position={[0.07, 1.55, 0]} rotation={[0, 0, 0.05]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 1.15, 8]} />
        <meshStandardMaterial color="#7a4c2e" roughness={0.88} />
      </mesh>
      <mesh position={[0.09, 2.35, 0]} rotation={[0, 0, 0.07]} castShadow>
        <cylinderGeometry args={[0.055, 0.08, 0.7, 7]} />
        <meshStandardMaterial color="#8a5834" roughness={0.86} />
      </mesh>
      {[0.35, 0.95, 1.55, 2.1].map((y) => (
        <mesh key={y} position={[0.05 + y * 0.015, y, 0]} rotation={[0, y * 0.7, 0.05]}>
          <torusGeometry args={[0.11 - y * 0.015, 0.018, 5, 10]} />
          <meshStandardMaterial color="#5a3820" roughness={1} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[Math.sin(i * 2.1) * 0.12, 2.55, Math.cos(i * 2.1) * 0.1]}>
          <sphereGeometry args={[0.09, 7, 6]} />
          <meshStandardMaterial color="#6b3d1e" roughness={0.75} />
        </mesh>
      ))}
      {crown.map((angle) => (
        <mesh key={angle} position={[Math.sin(angle) * 0.16, 2.78, Math.cos(angle) * 0.1]} rotation={[0.95, angle, 0.08]}>
          <planeGeometry args={[0.78, 1.45]} />
          <meshStandardMaterial map={frond ?? undefined} color={frond ? '#ffffff' : '#2f9a4a'} transparent alphaTest={0.35} side={DoubleSide} roughness={0.7} />
        </mesh>
      ))}
      {crown.filter((_, i) => i % 2 === 0).map((angle) => (
        <mesh key={`inner-${angle}`} position={[Math.sin(angle + 0.4) * 0.08, 2.7, Math.cos(angle + 0.4) * 0.06]} rotation={[1.15, angle + 0.5, 0]}>
          <planeGeometry args={[0.55, 1.05]} />
          <meshStandardMaterial map={frond ?? undefined} color={frond ? '#e8ffe8' : '#3aad55'} transparent alphaTest={0.35} side={DoubleSide} roughness={0.72} />
        </mesh>
      ))}
    </group>
  );
}

function Umbrella({ x, z, cloth, yaw = 0, scale = 1 }: { x: number; z: number; cloth: CanvasTexture | null; yaw?: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]} scale={scale}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.9, 8]} />
        <meshStandardMaterial color="#f7f5ed" />
      </mesh>
      <mesh position={[0, 1.82, 0]} castShadow>
        <coneGeometry args={[0.95, 0.38, 16]} />
        <meshStandardMaterial map={cloth ?? undefined} color={cloth ? '#ffffff' : '#1FA85A'} roughness={0.62} />
      </mesh>
      <mesh position={[0, 1.95, 0]}>
        <sphereGeometry args={[0.05, 8, 6]} />
        <meshStandardMaterial color="#F5C94D" roughness={0.5} />
      </mesh>
    </group>
  );
}

/** Green cloth with a yellow diamond: beach colours, not a detailed national emblem. */
function Pennant({ x, z, yaw = 0 }: { x: number; z: number; yaw?: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
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

function Bunting({ x, z }: { x: number; z: number }) {
  const flags = [
    { u: 0.15, color: '#FF805D' },
    { u: 0.45, color: '#12BFA6' },
    { u: 0.75, color: '#F5C94D' },
    { u: 1.05, color: '#EAF44A' },
    { u: 1.35, color: '#FF805D' },
  ];
  return (
    <group position={[x, 0, z]} rotation={[0, 0.35, 0]}>
      <mesh position={[0.75, 1.85, 0]} rotation={[0, 0, 0.08]}>
        <boxGeometry args={[1.6, 0.02, 0.02]} />
        <meshBasicMaterial color="#f4efe4" />
      </mesh>
      {flags.map((f) => (
        <mesh key={f.u} position={[f.u, 1.72, 0]} rotation={[0.15, 0, 0.1]}>
          <coneGeometry args={[0.1, 0.22, 3]} />
          <meshBasicMaterial color={f.color} />
        </mesh>
      ))}
    </group>
  );
}

function Barraca({ x, z, cloth, yaw = 0.5, warm = false }: { x: number; z: number; cloth: CanvasTexture | null; yaw?: number; warm?: boolean }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 1.1, 0.85]} />
        <meshStandardMaterial color={warm ? '#e8b86a' : '#e7d7b8'} roughness={0.88} />
      </mesh>
      <mesh position={[0, 0.35, 0.44]}>
        <boxGeometry args={[1.2, 0.55, 0.06]} />
        <meshStandardMaterial color="#c9a878" roughness={0.85} />
      </mesh>
      <mesh position={[0.35, 0.62, 0.44]}>
        <planeGeometry args={[0.28, 0.32]} />
        <meshBasicMaterial color="#2a4550" />
      </mesh>
      <mesh position={[0, 1.22, 0.2]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[1.85, 0.08, 1.25]} />
        <meshStandardMaterial map={cloth ?? undefined} color={cloth ? '#ffffff' : '#F5C94D'} roughness={0.7} />
      </mesh>
      <mesh position={[-0.55, 1.05, 0.55]}>
        <cylinderGeometry args={[0.03, 0.03, 1.4, 5]} />
        <meshStandardMaterial color="#c4a878" />
      </mesh>
      <mesh position={[0.55, 1.05, 0.55]}>
        <cylinderGeometry args={[0.03, 0.03, 1.4, 5]} />
        <meshStandardMaterial color="#c4a878" />
      </mesh>
    </group>
  );
}

function Towel({ x, z, yaw, art }: { x: number; z: number; yaw: number; art: CanvasTexture | null }) {
  return (
    <mesh position={[x, 0.018, z]} rotation={[-Math.PI / 2, 0, yaw]} receiveShadow>
      <planeGeometry args={[0.72, 1.35]} />
      <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#12BFA6'} roughness={0.92} />
    </mesh>
  );
}

function Cooler({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, -0.4, 0]}>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[0.55, 0.42, 0.38]} />
        <meshStandardMaterial color="#12BFA6" roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[0.58, 0.06, 0.4]} />
        <meshStandardMaterial color="#0e9a86" roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.48, 0]} rotation={[0, 0, Math.PI / 2]}>
        <torusGeometry args={[0.12, 0.02, 5, 12, Math.PI]} />
        <meshStandardMaterial color="#f7f5ed" roughness={0.6} />
      </mesh>
      <mesh position={[0.18, 0.22, 0.2]}>
        <boxGeometry args={[0.12, 0.08, 0.02]} />
        <meshBasicMaterial color="#EAF44A" />
      </mesh>
    </group>
  );
}

function RockCluster({ x, z, scale = 1 }: { x: number; z: number; scale?: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.12, 0]} scale={[1, 0.55, 0.85]} castShadow>
        <sphereGeometry args={[0.28, 8, 6]} />
        <meshStandardMaterial color="#9a8468" roughness={0.95} />
      </mesh>
      <mesh position={[0.22, 0.08, 0.1]} scale={[0.7, 0.4, 0.6]}>
        <sphereGeometry args={[0.22, 7, 5]} />
        <meshStandardMaterial color="#8a7458" roughness={1} />
      </mesh>
      <mesh position={[-0.18, 0.06, 0.12]} scale={[0.55, 0.32, 0.5]}>
        <sphereGeometry args={[0.2, 7, 5]} />
        <meshStandardMaterial color="#b09a78" roughness={0.98} />
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
      child.position.z = -4.05 - i * 0.55 + Math.sin(t * 0.9 + i * 1.3) * 0.14;
      child.position.x = Math.sin(t * 0.35 + i) * 0.12;
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -4.1 - i * 0.55]}>
          <planeGeometry args={[20, 0.08 + (i % 2) * 0.04]} />
          <meshBasicMaterial color={i % 2 ? '#f7f5ed' : '#d8f7ff'} transparent opacity={0.7 - i * 0.08} />
        </mesh>
      ))}
    </group>
  );
}

function Seagull({ art }: { art: CanvasTexture | null }) {
  const group = useRef<Group>(null);
  useFrame(({ clock, camera }) => {
    const pose = birdPose(clock.elapsedTime);
    const bird = group.current;
    if (!bird) return;
    bird.position.set(pose.x, pose.y, pose.z);
    bird.lookAt(camera.position);
    const flap = 1 + Math.max(0, pose.flap) * 0.06;
    bird.scale.set(flap, 1.08 - (flap - 1), 1);
  });
  return (
    <group ref={group}>
      <mesh>
        <planeGeometry args={[1.7, 1.15]} />
        <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#f7f5ed'} transparent alphaTest={0.25} side={DoubleSide} roughness={0.8} fog={false} />
      </mesh>
    </group>
  );
}

/** Decorative ball only. It never joins the physics ball. */
function BeachBall({ quality, art }: { quality: Quality; art: CanvasTexture | null }) {
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const pose = beachBallPose(clock.elapsedTime);
    fx.propTime = clock.elapsedTime;
    const popped = fx.beachPop === pose.loop;
    if (group.current) group.current.position.set(pose.x, popped ? 0.06 : pose.y, pose.z);
    if (spin.current) {
      spin.current.rotation.z = pose.spin;
      spin.current.scale.set(popped ? 1.35 : 1, popped ? 0.12 : 1, popped ? 1.35 : 1);
    }
    if (shadow.current) {
      shadow.current.position.set(pose.x, 0.02, pose.z);
      const lift = Math.min(1, pose.y);
      shadow.current.scale.setScalar(popped ? 1.2 : Math.max(0.45, 1.05 - lift * 0.35));
    }
  });
  return (
    <group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 14]} />
        <meshBasicMaterial color="#6a4a28" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={group}>
        <group ref={spin}>
          <mesh>
            <sphereGeometry args={[0.32, quality === 'low' ? 16 : 28, quality === 'low' ? 12 : 20]} />
            <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#e23d3d'} roughness={0.42} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Rain({ quality }: { quality: Quality }) {
  const drops = useRef<Group>(null);
  const count = quality === 'low' ? 6 : 14;
  useFrame(({ clock }) => {
    const group = drops.current;
    if (!group) return;
    group.visible = fx.shower > 0.04;
    const t = clock.elapsedTime;
    group.children.forEach((child, i) => {
      const fall = (t * 1.8 + i * 0.37) % 1;
      child.position.set(-3.2 + (i % 7) * 1.05, 4.2 - fall * 4, -1.2 - (i % 3) * 0.8);
    });
  });
  return (
    <group ref={drops} visible={false}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.015, 0.28, 0.015]} />
          <meshBasicMaterial color="#d5f4ff" transparent opacity={0.45} />
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
  const frond = useArtTexture(ART.frond, true);
  const awning = useArtTexture(ART.awning, false);
  const gull = useArtTexture(ART.seagull, true);
  const beachBallArt = useArtTexture(ART.ball, false);
  const towel = useArtTexture(ART.towel, false);
  const clouds = useArtTexture(ART.clouds, true);
  const sea = useRef<Mesh>(null);
  const sandMat = useRef<MeshStandardMaterial>(null);
  const skyDim = useRef<Mesh>(null);
  const leaves = quality === 'low' ? 5 : 8;
  useEffect(() => () => { sand.dispose(); water.dispose(); sky.dispose(); }, [sand, water, sky]);
  useFrame(({ clock }) => {
    const material = sea.current?.material;
    if (quality !== 'low' && material instanceof MeshStandardMaterial && material.map) material.map.offset.x = clock.elapsedTime * 0.04;
    const wet = fx.shower;
    if (sandMat.current) sandMat.current.color.setRGB(0.953 - wet * 0.42, 0.843 - wet * 0.38, 0.643 - wet * 0.25);
    const dim = skyDim.current;
    if (dim) {
      dim.visible = wet > 0.02;
      const mat = dim.material;
      if (mat instanceof MeshStandardMaterial) mat.opacity = wet * 0.55;
    }
  });
  return (
    <group>
      <mesh position={[0, 5.4, -14.5]}>
        <planeGeometry args={[46, 18]} />
        <meshBasicMaterial map={sky} />
      </mesh>
      <mesh ref={skyDim} position={[0, 5.35, -13.8]} visible={false}>
        <planeGeometry args={[46, 18]} />
        <meshStandardMaterial color="#1c3348" transparent opacity={0} depthWrite={false} />
      </mesh>

      {quality !== 'low' && clouds && (
        <>
          <mesh position={[-2.2, 6.6, -11.2]} scale={[2.6, 1.0, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={clouds} transparent alphaTest={0.4} depthWrite={false} fog={false} />
          </mesh>
          <mesh position={[2.4, 6.2, -10.8]} scale={[2.2, 0.9, 1]}>
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial map={clouds} transparent alphaTest={0.4} depthWrite={false} fog={false} />
          </mesh>
        </>
      )}

      <CoastalHills quality={quality} />
      <CoastalNeighbourhood quality={quality} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.4]} receiveShadow={shadows}>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial ref={sandMat} map={sand} color="#f3d7a4" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -3.35]} receiveShadow={shadows}>
        <planeGeometry args={[22, 2.8]} />
        <meshStandardMaterial color="#b99462" roughness={0.55} metalness={0.04} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -4.45]}>
        <planeGeometry args={[22, 1.1]} />
        <meshStandardMaterial color="#7ec9dc" roughness={0.32} metalness={0.14} transparent opacity={0.62} />
      </mesh>
      <mesh ref={sea} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -8.6]}>
        <planeGeometry args={[36, 12]} />
        <meshStandardMaterial map={water} color="#ffffff" roughness={quality === 'high' ? 0.12 : 0.28} metalness={quality === 'low' ? 0.08 : 0.28} />
      </mesh>
      {quality !== 'low' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.015, -11.4]}>
          <planeGeometry args={[36, 6]} />
          <meshStandardMaterial color="#0c5a78" roughness={0.2} metalness={0.35} />
        </mesh>
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4.0]}>
        <planeGeometry args={[20, 0.75]} />
        <meshBasicMaterial color="#f7f5ed" transparent opacity={0.55} />
      </mesh>

      {/* Sun — left of frame; hills stay clear of this pocket. */}
      <group position={[-4.55, 2.05, -6.0]}>
        <mesh>
          <sphereGeometry args={[0.68, quality === 'low' ? 10 : 20, quality === 'low' ? 10 : 16]} />
          <meshBasicMaterial color="#ffe56a" fog={false} />
        </mesh>
        {quality !== 'low' && (
          <mesh>
            <sphereGeometry args={[1.35, 16, 12]} />
            <meshBasicMaterial color="#ffe9a8" transparent opacity={0.34} depthWrite={false} fog={false} />
          </mesh>
        )}
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.15, 1.22, 48]} />
        <meshBasicMaterial color="#fff6df" />
      </mesh>
      <Waves />
      <Seagull art={gull} />
      <BeachBall quality={quality} art={beachBallArt} />
      <Rain quality={quality} />
      <Spectators scene="beach" />

      {/* Near / mid props — all outside |x|<1.6, z −0.8..1.6 */}
      <Palm x={-3.6} z={-2.2} lean={0.08} leaves={leaves} frond={frond} />
      <Palm x={3.5} z={-1.6} lean={-0.1} scale={0.92} leaves={leaves} frond={frond} />
      <Palm x={-4.6} z={1.2} lean={0.16} scale={0.8} leaves={leaves} frond={frond} />
      {quality !== 'low' && <Palm x={4.4} z={-2.9} lean={-0.14} scale={0.72} leaves={leaves} frond={frond} />}
      <Umbrella x={2.7} z={-2.7} cloth={awning} yaw={-0.25} />
      {quality !== 'low' && <Umbrella x={-3.55} z={-2.55} cloth={towel} yaw={0.55} scale={0.88} />}
      <Barraca x={-2.9} z={-3.05} cloth={awning} />
      {quality !== 'low' && <Barraca x={3.1} z={-3.15} cloth={towel} yaw={-1.05} warm />}
      <Pennant x={1.7} z={-2.55} />
      {quality !== 'low' && <Pennant x={-1.95} z={-2.7} yaw={0.4} />}
      <Bunting x={2.05} z={-2.95} />
      <Towel x={2.15} z={-2.05} yaw={0.35} art={towel} />
      {quality !== 'low' && <Towel x={-2.45} z={-1.95} yaw={-0.5} art={towel} />}
      <Cooler x={2.95} z={-2.05} />
      <RockCluster x={-3.9} z={0.95} scale={1.05} />
      <RockCluster x={4.15} z={-0.85} scale={0.9} />
      {quality !== 'low' && <RockCluster x={-4.8} z={-1.4} scale={0.75} />}

      <mesh position={[-5.2, -0.15, 1.4]} scale={[2.4, 0.45, 1.6]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#efd3a2" roughness={1} />
      </mesh>
      <mesh position={[5.4, -0.2, -0.4]} scale={[2.2, 0.4, 1.8]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#e8c48a" roughness={1} />
      </mesh>
      {quality !== 'low' && (
        <mesh position={[4.6, -0.12, 1.6]} scale={[1.6, 0.32, 1.3]}>
          <sphereGeometry args={[1, 9, 7]} />
          <meshStandardMaterial color="#edd0a0" roughness={1} />
        </mesh>
      )}
    </group>
  );
}
