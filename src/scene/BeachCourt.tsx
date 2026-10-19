import { useEffect, useMemo } from 'react';
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Quality } from '../game/storage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';

function useSand() {
  return useMemo(() => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
    const g = canvas.getContext('2d');
    let seed = 20261019;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    if (g) {
      g.fillStyle = '#d9bd87'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 13000; i++) {
        g.fillStyle = i % 3 ? 'rgba(255,245,214,.20)' : 'rgba(113,88,48,.14)';
        g.fillRect(random() * 512, random() * 512, 1 + random(), 1 + random());
      }
      for (let row = 0; row < 14; row++) {
        g.strokeStyle = 'rgba(138,112,67,.09)'; g.lineWidth = 1.3; g.beginPath();
        for (let x = 0; x <= 512; x += 4) {
          const y = row * 38 + Math.sin(x / 28 + row) * 4;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
    }
    const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping; texture.repeat.set(6, 6); texture.anisotropy = 4;
    return texture;
  }, []);
}

/** Remains playable if the detailed beach GLB is missing or cannot decode. */
function BeachFallback() {
  return <group>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.12, -22]}>
      <planeGeometry args={[45, 29]} /><meshStandardMaterial color="#4b9ca9" roughness={.85} />
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
  useEffect(() => () => sand.dispose(), [sand]);
  return <group>
    <EnvironmentBackdrop quality={quality} theme="beach" fallback={<BeachFallback />} />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
      <planeGeometry args={[36, 18]} /><meshStandardMaterial map={sand} roughness={1} />
    </mesh>
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
