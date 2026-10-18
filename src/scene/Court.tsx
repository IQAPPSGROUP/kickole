import { useMemo } from 'react';
import { CanvasTexture, DoubleSide, RepeatWrapping, SRGBColorSpace } from 'three';

const NAVY = '#142D35';
const TEAL = '#12BFA6';
const LIME = '#EAF44A';
const CORAL = '#FF805D';
const WHITE = '#F7F5ED';

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

/** Worn painted tarmac: speckle, scuffs and cracks. */
function useCourtTexture() {
  return useMemo(() => {
    const t = makeCanvas(512, (g, n) => {
      g.fillStyle = '#1f4a54';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = Math.random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.10)';
        g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 2, 1 + Math.random() * 2);
      }
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        let x = Math.random() * n, y = Math.random() * n;
        g.beginPath(); g.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = 'rgba(0,0,0,0.2)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, n, n);
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(3, 3);
    return t;
  }, []);
}

/** Brand-colour graffiti wall with soft shapes and tags. */
function useWallTexture() {
  return useMemo(
    () => makeCanvas(1024, (g, n) => {
      g.fillStyle = NAVY;
      g.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 64) {
        g.fillStyle = y % 128 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)';
        g.fillRect(0, y, n, 62);
      }
      const cols = [TEAL, LIME, CORAL, WHITE];
      for (let i = 0; i < 14; i++) {
        g.globalAlpha = 0.55;
        g.fillStyle = cols[i % 4];
        g.beginPath();
        g.ellipse(Math.random() * n, n * 0.25 + Math.random() * n * 0.6, 40 + Math.random() * 90, 25 + Math.random() * 60, Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.font = 'italic 900 150px sans-serif';
      g.lineWidth = 12;
      g.strokeStyle = NAVY;
      g.fillStyle = LIME;
      g.strokeText('KICKOLÉ', 150, 620);
      g.fillText('KICKOLÉ', 150, 620);
      // dark floor-fade for baked-style ambient occlusion
      const grad = g.createLinearGradient(0, n * 0.65, 0, n);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = grad;
      g.fillRect(0, n * 0.65, n, n * 0.35);
    }),
    [],
  );
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

export function Court({ shadows }: { shadows: boolean }) {
  const tex = useCourtTexture();
  const wall = useWallTexture();
  const fence = useFenceTexture();
  const blob = useBlobTexture();
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={tex} roughness={0.9} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[1.17, 1.22, 64]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]}>
          <planeGeometry args={[0.06, 9]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
      {/* Fake ambient occlusion where the walls meet the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -3.3]}>
        <planeGeometry args={[9, 0.8]} />
        <meshBasicMaterial map={blob} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 1.3, -3.6]} receiveShadow={shadows}>
        <boxGeometry args={[9, 2.6, 0.2]} />
        <meshStandardMaterial map={wall} roughness={0.9} />
      </mesh>
      <Poster x={-3.2} y={1.5} color={CORAL} />
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
          <meshStandardMaterial color="#0f2229" roughness={0.9} />
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
      <Floodlight x={-3.8} z={-3.2} />
      <Floodlight x={3.8} z={-3.2} />
    </group>
  );
}
