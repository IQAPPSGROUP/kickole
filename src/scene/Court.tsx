import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, CatmullRomCurve3, Color, DoubleSide, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace, Vector3, type MeshBasicMaterial, type PointLight } from 'three';
import type { Quality } from '../game/storage';
import { fx } from './fx';
import { Spectators } from './Spectators';

const NAVY = '#142D35';
const TEAL = '#12BFA6';
const LIME = '#EAF44A';
const CORAL = '#FF805D';
const WHITE = '#F7F5ED';
const GOLD = '#F5C94D';

// Stable paint wear: reloading or changing quality must not rearrange the court.
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

/** Asphalt apron with one worn green pelada painted in the middle. */
function useCourtTexture() {
  return useMemo(() => {
    const t = makeCanvas(1024, (g, n) => {
      const random = seededRandom(81);
      g.fillStyle = '#3c4347';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 8000; i++) {
        g.fillStyle = random() > 0.55 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.09)';
        g.fillRect(random() * n, random() * n, 1 + random() * 2, 1 + random() * 2);
      }
      const pad = n * 0.11;
      g.fillStyle = '#1c8a68';
      g.fillRect(pad, pad, n - pad * 2, n - pad * 2);
      g.fillStyle = '#176f55';
      g.fillRect(pad, n * 0.62, n - pad * 2, n * 0.22);
      for (let i = 0; i < 2200; i++) {
        const x = pad + random() * (n - pad * 2);
        const y = pad + random() * (n - pad * 2);
        g.fillStyle = random() > 0.72 ? 'rgba(60,67,71,0.45)' : 'rgba(255,255,255,0.05)';
        g.fillRect(x, y, 2 + random() * 10, 1 + random() * 4);
      }
      g.strokeStyle = 'rgba(247,245,237,0.28)';
      g.lineWidth = 10;
      g.strokeRect(pad + 18, pad + 18, n - pad * 2 - 36, n - pad * 2 - 36);
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 2;
      for (let i = 0; i < 7; i++) {
        let x = random() * n;
        let y = random() * pad;
        g.beginPath();
        g.moveTo(x, y);
        for (let j = 0; j < 5; j++) { x += (random() - 0.5) * 80; y += random() * 30; g.lineTo(x, y); }
        g.stroke();
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(1, 1);
    return t;
  }, []);
}

/** Original painted mural: sun, rolling colour bands and pavement-inspired waves. */
function useWallTexture() {
  return useMemo(() => makeCanvas(1024, (g, n) => {
    const random = seededRandom(1962);
    g.fillStyle = '#E8CF9C'; g.fillRect(0, 0, n, n);
    g.fillStyle = GOLD;
    g.beginPath(); g.arc(n * .74, n * .30, n * .23, 0, Math.PI * 2); g.fill();
    for (const [color, y] of [['#D76D4B', .53], ['#168F7A', .67], ['#12594F', .84]] as const) {
      g.fillStyle = color; g.beginPath(); g.moveTo(0, n * y);
      g.bezierCurveTo(n * .3, n * (y - .3), n * .55, n * (y + .2), n, n * (y - .1));
      g.lineTo(n, n); g.lineTo(0, n); g.closePath(); g.fill();
    }
    g.strokeStyle = '#F7E9C5'; g.lineWidth = 6;
    for (let row = 0; row < 3; row++) {
      g.beginPath();
      for (let x = 0; x <= n; x += 4) {
        const y = n * (.87 + row * .04) + Math.sin(x / 52) * 12;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 6500; i++) {
      g.fillStyle = i % 2 ? 'rgba(255,255,255,.10)' : 'rgba(20,45,53,.08)';
      g.fillRect(random() * n, random() * n, 1 + random() * 3, 1 + random() * 3);
    }
    const grad = g.createLinearGradient(0, n * .65, 0, n);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,.28)');
    g.fillStyle = grad; g.fillRect(0, n * .65, n, n * .35);
  }), []);
}

/** KICKOLÉ sign. The canvas aspect (4:1) matches the 3 x 0.75 m plane so letters are not stretched. */
function useSignTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = NAVY; g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = GOLD; g.lineWidth = 6; g.strokeRect(12, 12, 1000, 232);
      g.font = 'italic 900 150px "Trebuchet MS", "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = WHITE; g.fillText('KICKOLÉ', 512, 106, 930);
      g.font = '700 30px "Trebuchet MS", sans-serif';
      g.fillStyle = GOLD; g.fillText('FUTEBOL DE RUA', 512, 209);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
}

/** Chain-link fence pattern with transparency. */
function useFenceTexture() {
  return useMemo(() => {
    const t = makeCanvas(128, (g, n) => {
      g.strokeStyle = 'rgba(190,210,215,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      for (let i = -n; i < n * 2; i += 32) { g.moveTo(i, 0); g.lineTo(i + n, n); g.moveTo(i, n); g.lineTo(i + n, 0); }
      g.stroke();
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(16, 3);
    return t;
  }, []);
}

function useBrickTexture() {
  return useMemo(() => {
    const t = makeCanvas(256, (g, n) => {
      const random = seededRandom(44);
      g.fillStyle = '#c17a52';
      g.fillRect(0, 0, n, n);
      const bw = 32;
      const bh = 16;
      for (let y = 0; y < n; y += bh) {
        const offset = (y / bh) % 2 ? bw / 2 : 0;
        for (let x = -bw; x < n + bw; x += bw) {
          const shade = 0.9 + random() * 0.18;
          g.fillStyle = `rgba(${Math.floor(193 * shade)}, ${Math.floor(122 * shade)}, ${Math.floor(82 * shade)}, 1)`;
          g.fillRect(x + offset + 1, y + 1, bw - 2, bh - 2);
        }
      }
      g.strokeStyle = 'rgba(70,36,24,0.45)';
      g.lineWidth = 2;
      for (let y = 0; y <= n; y += bh) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(n, y); g.stroke();
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(7, 2);
    return t;
  }, []);
}

function useNetTexture() {
  return useMemo(() => {
    const t = makeCanvas(128, (g, n) => {
      g.clearRect(0, 0, n, n);
      g.strokeStyle = 'rgba(236,242,244,0.92)';
      g.lineWidth = 2;
      for (let i = 0; i <= n; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, n); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(n, i); g.stroke();
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(5, 3);
    return t;
  }, []);
}

/** Soft radial dark patch used as a fake contact shadow / ambient occlusion decal. */
function useBlobTexture() {
  return useMemo(
    () => makeCanvas(128, (g, n) => {
      const grad = g.createRadialGradient(n / 2, n / 2, 4, n / 2, n / 2, n / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }),
    [],
  );
}

function Bin({ x, z, color }: { x: number; z: number; color: string }) {
  const blob = useBlobTexture();
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.17, 0.6, 14]} />
        <meshStandardMaterial color={color} roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 14]} />
        <meshStandardMaterial color="#0d1e24" />
      </mesh>
    </group>
  );
}

function Poster({ x, y, color, w = 0.7, h = 0.95 }: { x: number; y: number; color: string; w?: number; h?: number }) {
  return (
    <group position={[x, y, -3.47]}>
      <mesh>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial color={WHITE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, 0.012]}>
        <boxGeometry args={[w * 0.8, h * 0.55, 0.01]} />
        <meshStandardMaterial color={color} roughness={0.8} />
      </mesh>
      <mesh position={[0, -h * 0.34, 0.012]}>
        <boxGeometry args={[w * 0.6, 0.06, 0.01]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
    </group>
  );
}

function Floodlight({ x, z }: { x: number; z: number }) {
  const lamp = useRef<MeshBasicMaterial>(null);
  const glow = useRef<MeshBasicMaterial>(null);
  const bulb = useRef<PointLight>(null);
  useFrame(({ clock }) => {
    const shower = fx.shower;
    const blink = shower > 0 && Math.sin(clock.elapsedTime * 34) > 0.15;
    if (lamp.current) lamp.current.color.set(blink ? '#5c4e32' : '#fff1c9');
    if (glow.current) glow.current.opacity = shower > 0 ? (blink ? 0.12 : 0.7) : 0.55;
    if (bulb.current) bulb.current.intensity = shower > 0 ? (blink ? 0.3 : 7) : 0;
  });
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.07, 3.6, 8]} />
        <meshStandardMaterial color="#1a2428" metalness={0.35} roughness={0.45} />
      </mesh>
      <mesh position={[0, 3.65, 0]}>
        <boxGeometry args={[0.55, 0.14, 0.22]} />
        <meshStandardMaterial color="#2a3034" metalness={0.4} roughness={0.4} />
      </mesh>
      <mesh position={[0, 3.58, 0.08]}>
        <boxGeometry args={[0.42, 0.06, 0.04]} />
        <meshBasicMaterial ref={lamp} color="#fff1c9" toneMapped={false} />
      </mesh>
      <mesh position={[0, 3.45, 0.2]}>
        <sphereGeometry args={[0.16, 10, 8]} />
        <meshBasicMaterial ref={glow} color="#ffe7b0" transparent opacity={0.55} toneMapped={false} depthWrite={false} />
      </mesh>
      <pointLight ref={bulb} position={[0, 3.3, 0.4]} color="#ffe2b0" intensity={0} distance={9} decay={2} />
    </group>
  );
}

function StreetGoal({ net }: { net: CanvasTexture }) {
  return (
    <group position={[0, 0, -3.18]}>
      {[-1.2, 1.2].map((x) => (
        <mesh key={x} position={[x, 0.7, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.05, 1.4, 8]} />
          <meshStandardMaterial color="#f3f0e6" roughness={0.38} metalness={0.28} />
        </mesh>
      ))}
      <mesh position={[0, 1.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 2.48, 8]} />
        <meshStandardMaterial color="#f3f0e6" roughness={0.38} metalness={0.28} />
      </mesh>
      <mesh position={[0, 0.7, -0.04]}>
        <planeGeometry args={[2.32, 1.32]} />
        <meshStandardMaterial map={net} transparent alphaTest={0.35} side={DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

function Planter({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.18, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.16, 0.36, 8]} />
        <meshStandardMaterial color="#b85a32" roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.42, 0]} castShadow>
        <sphereGeometry args={[0.26, 8, 6]} />
        <meshStandardMaterial color="#1f8f4a" roughness={0.75} />
      </mesh>
    </group>
  );
}

function Crates({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.16, 0]} castShadow>
        <boxGeometry args={[0.42, 0.32, 0.42]} />
        <meshStandardMaterial color="#c48a48" roughness={0.8} />
      </mesh>
      <mesh position={[0.08, 0.46, 0.04]} rotation={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.34, 0.28, 0.34]} />
        <meshStandardMaterial color="#a8743a" roughness={0.82} />
      </mesh>
    </group>
  );
}

function ClothesLine() {
  const cloth = ['#1FA85A', '#F7F5ED', '#FF805D'] as const;
  return (
    <group position={[-3.45, 0, 0.15]}>
      {[-1.05, 1.05].map((z) => (
        <mesh key={z} position={[0, 0.85, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.035, 1.7, 6]} />
          <meshStandardMaterial color="#e7e1d4" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 1.68, 0]}>
        <boxGeometry args={[0.015, 0.015, 2.1]} />
        <meshStandardMaterial color="#1b2428" />
      </mesh>
      {cloth.map((color, i) => (
        <mesh key={color} position={[0.02, 1.46, -0.45 + i * 0.45]} castShadow>
          <boxGeometry args={[0.02, 0.38, 0.32]} />
          <meshStandardMaterial color={color} roughness={0.86} />
        </mesh>
      ))}
    </group>
  );
}

function Festoon({ bulbs }: { bulbs: number }) {
  const ref = useRef<InstancedMesh>(null);
  const curve = useMemo(() => {
    const pts: Vector3[] = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 8;
      pts.push(new Vector3(-3.55 + u * 7.1, 3.55 - Math.sin(u * Math.PI) * 0.48, -2.55));
    }
    return new CatmullRomCurve3(pts);
  }, []);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new Object3D();
    const c = new Color();
    for (let i = 0; i < bulbs; i++) {
      const u = bulbs === 1 ? 0.5 : i / (bulbs - 1);
      d.position.set(-3.55 + u * 7.1, 3.48 - Math.sin(u * Math.PI) * 0.48, -2.55);
      d.scale.setScalar(i % 4 === 0 ? 1.15 : 0.8);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set(i % 3 === 0 ? '#fff4d2' : i % 3 === 1 ? '#ffe0a0' : '#fffaf0'));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bulbs]);
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 28, 0.012, 4, false]} />
        <meshStandardMaterial color="#141c20" roughness={0.6} />
      </mesh>
      <instancedMesh ref={ref} args={[undefined, undefined, bulbs]}>
        <sphereGeometry args={[0.045, 6, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

const BUNTING_COLORS = ['#1FA85A', '#F5C94D', '#2E6FD0', '#F7F5ED'];

/** Festa-style bunting: one instanced draw call, strung across the back of the court. */
function Bunting() {
  const ref = useRef<InstancedMesh>(null);
  const N = 22;
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    const d = new Object3D();
    const c = new Color();
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      d.position.set(-3.7 + u * 7.4, 2.62 - Math.sin(u * Math.PI) * 0.22 - 0.09, -3.18);
      d.rotation.set(0, 0, Math.PI + (u - 0.5) * 0.25);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, c.set(BUNTING_COLORS[i % BUNTING_COLORS.length]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <circleGeometry args={[0.1, 3]} />
      <meshBasicMaterial side={DoubleSide} />
    </instancedMesh>
  );
}

function Window({ x, glow }: { x: number; glow: number }) {
  return (
    <group position={[x, 1.15, -3.46]}>
      <mesh>
        <boxGeometry args={[0.78, 0.58, 0.06]} />
        <meshStandardMaterial color="#1a2428" roughness={0.45} metalness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <boxGeometry args={[0.62, 0.42, 0.02]} />
        <meshStandardMaterial color="#2a241c" emissive="#ffb15e" emissiveIntensity={glow} roughness={0.25} />
      </mesh>
    </group>
  );
}

export function Court({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const tex = useCourtTexture();
  const wall = useWallTexture();
  const sign = useSignTexture();
  const fence = useFenceTexture();
  const brick = useBrickTexture();
  const net = useNetTexture();
  const blob = useBlobTexture();
  useEffect(() => () => {
    tex.dispose(); wall.dispose(); sign.dispose(); fence.dispose(); brick.dispose(); net.dispose(); blob.dispose();
  }, [tex, wall, sign, fence, brick, net, blob]);
  const glow = quality === 'low' ? 0.2 : quality === 'medium' ? 0.45 : 0.7;
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0.2]} receiveShadow={shadows}>
        <planeGeometry args={[16, 14]} />
        <meshStandardMaterial color="#2b3134" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={tex} roughness={0.86} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <ringGeometry args={[1.17, 1.24, 64]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 0]}>
          <planeGeometry args={[0.06, 9]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -3.3]}>
        <planeGeometry args={[9, 0.8]} />
        <meshBasicMaterial map={blob} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.08, 4.15]} receiveShadow={shadows}>
        <boxGeometry args={[9.2, 0.16, 0.22]} />
        <meshStandardMaterial color="#d9d0c0" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.3, -3.6]} receiveShadow={shadows}>
        <boxGeometry args={[9, 2.6, 0.2]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>
      <mesh position={[-1.6, 2.02, -3.48]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <Poster x={1.75} y={1.5} color={CORAL} />
      <Poster x={2.6} y={1.25} color={TEAL} w={0.62} h={0.5} />
      <Window x={-3.72} glow={glow} />
      <Window x={3.55} glow={glow * 0.8} />
      <mesh position={[0, 2.9, -3.4]}>
        <planeGeometry args={[9, 0.7]} />
        <meshStandardMaterial map={fence} transparent alphaTest={0.3} side={DoubleSide} roughness={0.5} metalness={0.5} />
      </mesh>
      {[-4, -2, 0, 2, 4].map((x) => (
        <mesh key={x} position={[x, 2.9, -3.4]}>
          <boxGeometry args={[0.06, 0.8, 0.06]} />
          <meshStandardMaterial color="#9fb3b8" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]} receiveShadow={shadows} castShadow>
          <boxGeometry args={[0.2, 0.9, 9]} />
          <meshStandardMaterial map={brick} roughness={0.92} />
        </mesh>
      ))}
      {[-2.6, 2.6].map((x) => (
        <mesh key={`paint-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, 1.2]}>
          <planeGeometry args={[0.09, 3.4]} />
          <meshBasicMaterial color={GOLD} />
        </mesh>
      ))}
      <StreetGoal net={net} />
      <Bin x={-3.7} z={-3} color={TEAL} />
      <Bin x={-3.1} z={-3.1} color={CORAL} />
      <mesh position={[3.15, 0.3, -2.85]}>
        <boxGeometry args={[1.2, 0.08, 0.35]} />
        <meshStandardMaterial color={LIME} roughness={0.7} />
      </mesh>
      <mesh position={[3.15, 0.15, -2.85]} castShadow>
        <boxGeometry args={[1.1, 0.3, 0.3]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.15, 0.005, -2.85]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <Planter x={3.35} z={1.7} />
      <Planter x={-3.15} z={2.15} />
      <Crates x={3.45} z={2.55} />
      <ClothesLine />
      <Bunting />
      {quality !== 'low' && <Festoon bulbs={quality === 'high' ? 22 : 14} />}
      <Floodlight x={-3.8} z={-3.2} />
      <Floodlight x={3.8} z={-3.2} />
      <Spectators scene="rua" />
    </group>
  );
}
