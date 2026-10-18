import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { CanvasTexture, Color, DoubleSide, InstancedMesh, Object3D, RepeatWrapping, SRGBColorSpace } from 'three';

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

/** Procedural grass with subtle alternating mowing stripes. */
function useCourtTexture() {
  return useMemo(() => {
    const t = makeCanvas(512, (g, n) => {
      const random = seededRandom(81);
      g.fillStyle = '#287443';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 8; i++) {
        g.fillStyle = i % 2 ? '#2d7d47' : '#246c3d';
        g.fillRect(i * n / 8, 0, n / 8, n);
      }
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.045)';
        g.fillRect(random() * n, random() * n, 1 + random() * 2, 2 + random() * 5);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(1, 1);
    return t;
  }, []);
}

/** Lightweight dusk sky and softly blurred crowd painted into a single backdrop texture. */
function useWallTexture() {
  return useMemo(() => makeCanvas(1024, (g, n) => {
    const random = seededRandom(1962);
    const sky = g.createLinearGradient(0, 0, 0, n);
    sky.addColorStop(0, '#172d46'); sky.addColorStop(0.45, '#52677a'); sky.addColorStop(1, '#e5a56d');
    g.fillStyle = sky; g.fillRect(0, 0, n, n);
    g.fillStyle = 'rgba(255,210,145,.55)';
    g.beginPath(); g.arc(n * .76, n * .33, n * .09, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#263b47';
    g.fillRect(0, n * .43, n, n * .57);
    g.fillStyle = '#354c56';
    g.fillRect(0, n * .49, n, n * .06);
    g.fillStyle = '#152b35';
    g.fillRect(0, n * .75, n, n * .25);
    const colors = ['#f2c18c', '#e9e2ce', '#d97858', '#61b89a', '#e3c84c', '#788fb4'];
    g.save();
    g.filter = 'blur(2px)';
    for (let row = 0; row < 7; row++) {
      const y = n * (0.51 + row * 0.037);
      const offset = row % 2 ? 12 : 0;
      for (let x = -8 + offset; x < n; x += 18) {
        const cx = x + random() * 7;
        const cy = y + random() * 8;
        g.fillStyle = colors[(random() * colors.length) | 0];
        g.beginPath(); g.arc(cx, cy, 3 + random() * 2, 0, Math.PI * 2); g.fill();
        g.beginPath();
        g.ellipse(cx, cy + 9, 6, 7 + random() * 3, 0, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.restore();
    for (let x = 0; x < n; x += 128) {
      g.fillStyle = x % 256 ? '#e3a849' : '#d36e50';
      g.fillRect(x, n * .79, 96, n * .025);
    }
    const shade = g.createLinearGradient(0, 0, 0, n);
    shade.addColorStop(0, 'rgba(8,20,32,.15)'); shade.addColorStop(1, 'rgba(8,20,32,.45)');
    g.fillStyle = shade; g.fillRect(0, 0, n, n);
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
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 3.6, 8]} />
        <meshStandardMaterial color="#0d1e24" />
      </mesh>
      <mesh position={[0, 3.65, 0]}>
        <boxGeometry args={[0.5, 0.12, 0.2]} />
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={3} />
      </mesh>
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

export function Court({ shadows }: { shadows: boolean }) {
  const tex = useCourtTexture();
  const wall = useWallTexture();
  const sign = useSignTexture();
  const fence = useFenceTexture();
  const blob = useBlobTexture();
  useEffect(() => () => {
    tex.dispose(); wall.dispose(); sign.dispose(); fence.dispose(); blob.dispose();
  }, [tex, wall, sign, fence, blob]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[1.17, 1.24, 64]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={`side-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]}>
          <planeGeometry args={[0.055, 8.2]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
      {[-4.1, 4.1].map((z) => (
        <mesh key={`end-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, z]}>
          <planeGeometry args={[6.85, 0.055]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <planeGeometry args={[6.85, 0.045]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={`box-${side}`}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, side * 2.75]}>
            <planeGeometry args={[2.3, 0.045]} />
            <meshBasicMaterial color={WHITE} />
          </mesh>
          {[-1.15, 1.15].map((x) => (
            <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, side * 3.4]}>
              <planeGeometry args={[0.045, 1.35]} />
              <meshBasicMaterial color={WHITE} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Fake ambient occlusion where the walls meet the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -3.3]}>
        <planeGeometry args={[9, 0.8]} />
        <meshBasicMaterial map={blob} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 1.3, -3.6]}>
        <planeGeometry args={[9, 2.6]} />
        <meshBasicMaterial map={wall} />
      </mesh>
      <mesh position={[-1.6, 2.02, -3.48]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <Poster x={1.9} y={1.4} color={CORAL} />
      <Poster x={3.1} y={1.45} color={TEAL} w={0.9} h={0.7} />
      {/* Chain-link fence along the top of the wall */}
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
      {/* Low side walls */}
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.2, 0.9, 9]} />
          <meshStandardMaterial color="#D49468" roughness={0.9} />
        </mesh>
      ))}
      {/* Painted court corners; simple geometry adds no texture downloads. */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={`paint-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 1.2]}>
          <planeGeometry args={[0.09, 3.4]} />
          <meshBasicMaterial color={GOLD} />
        </mesh>
      ))}
      {/* Props */}
      <Bin x={-3.7} z={-3} color={TEAL} />
      <Bin x={-3.1} z={-3.1} color={CORAL} />
      <mesh position={[2.9, 0.3, -2.9]}>
        <boxGeometry args={[1.2, 0.08, 0.35]} />
        <meshStandardMaterial color={LIME} roughness={0.7} />
      </mesh>
      <mesh position={[2.9, 0.15, -2.9]}>
        <boxGeometry args={[1.1, 0.3, 0.3]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.9, 0.005, -2.9]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <Bunting />
      <Floodlight x={-3.8} z={-3.2} />
      <Floodlight x={3.8} z={-3.2} />
    </group>
  );
}
