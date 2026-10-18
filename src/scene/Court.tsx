import { useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';

const NAVY = '#142D35';
const TEAL = '#12BFA6';
const LIME = '#EAF44A';
const CORAL = '#FF805D';
const WHITE = '#F7F5ED';

function useCourtTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = '#1c4852';
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let i = 0; i < 256; i += 64) g.fillRect(i, 0, 32, 256);
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.lineWidth = 2;
      g.strokeRect(0, 0, 256, 256);
    }
    const t = new CanvasTexture(c);
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(5, 5);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
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
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={1.6} />
      </mesh>
    </group>
  );
}

export function Court({ shadows }: { shadows: boolean }) {
  const tex = useCourtTexture();
  const panels: Array<[number, string, number]> = [
    [-2.6, CORAL, 1.1], [-1.4, LIME, 0.8], [-0.2, TEAL, 1.3], [1.1, WHITE, 0.7], [2.2, CORAL, 1.0],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={tex} roughness={0.95} />
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
      {/* Back wall with colour blocks */}
      <mesh position={[0, 1.3, -3.6]} receiveShadow={shadows}>
        <boxGeometry args={[9, 2.6, 0.2]} />
        <meshStandardMaterial color={NAVY} roughness={0.9} />
      </mesh>
      {panels.map(([x, c, h]) => (
        <mesh key={x} position={[x, 0.2 + h / 2, -3.48]}>
          <boxGeometry args={[0.9, h, 0.04]} />
          <meshStandardMaterial color={c} roughness={0.8} />
        </mesh>
      ))}
      {/* Low side walls */}
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.2, 0.9, 9]} />
          <meshStandardMaterial color="#0f2229" roughness={0.9} />
        </mesh>
      ))}
      {/* Fence posts */}
      {[-4, -2, 0, 2, 4].map((x) => (
        <mesh key={x} position={[x, 1.8, -3.45]}>
          <boxGeometry args={[0.06, 1.2, 0.06]} />
          <meshStandardMaterial color="#9fb3b8" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
      {/* Bench */}
      <mesh position={[2.9, 0.3, -2.9]}>
        <boxGeometry args={[1.2, 0.08, 0.35]} />
        <meshStandardMaterial color={LIME} roughness={0.7} />
      </mesh>
      <mesh position={[2.9, 0.15, -2.9]}>
        <boxGeometry args={[1.1, 0.3, 0.3]} />
        <meshStandardMaterial color={NAVY} />
      </mesh>
      <Floodlight x={-3.8} z={-3.2} />
      <Floodlight x={3.8} z={-3.2} />
    </group>
  );
}
