import { useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Group, type Bone, type Object3D } from 'three';
import type { HairStyle } from '../game/appearance';
import { toonGradient } from './toon';

/**
 * Procedural hair silhouettes parented to the head bone so they follow every animation.
 * The authored Hair material mesh is hidden when a non-short style is active.
 */
export function HairVariants({
  head,
  style,
  color,
  hairMesh,
}: {
  head: Bone | Object3D | undefined;
  style: HairStyle;
  color: string;
  hairMesh?: Object3D[];
}) {
  const group = useRef<Group>(null);

  useLayoutEffect(() => {
    if (!head || !group.current) return;
    head.add(group.current);
    return () => {
      if (group.current) head.remove(group.current);
    };
  }, [head]);

  useFrame(() => {
    const hideAuthored = style !== 'short';
    if (hairMesh) for (const m of hairMesh) m.visible = !hideAuthored;
    if (group.current) group.current.visible = style !== 'short' && style !== 'bald';
  });

  if (!head) return null;

  return (
    <group ref={group}>
      {style === 'afro' && (
        <mesh position={[0, 0.12, -0.02]} castShadow>
          <sphereGeometry args={[0.2, 14, 12]} />
          <meshToonMaterial color={color} gradientMap={toonGradient()} />
        </mesh>
      )}
      {style === 'mohawk' && (
        <mesh position={[0, 0.18, -0.01]} castShadow>
          <boxGeometry args={[0.06, 0.22, 0.22]} />
          <meshToonMaterial color={color} gradientMap={toonGradient()} />
        </mesh>
      )}
      {style === 'highTop' && (
        <mesh position={[0, 0.2, -0.02]} castShadow>
          <cylinderGeometry args={[0.14, 0.16, 0.18, 12]} />
          <meshToonMaterial color={color} gradientMap={toonGradient()} />
        </mesh>
      )}
      {style === 'curls' && (
        <>
          {[[-0.08, 0.1, 0.06], [0.08, 0.1, 0.06], [0, 0.14, -0.08], [-0.1, 0.08, -0.04], [0.1, 0.08, -0.04]].map((p, i) => (
            <mesh key={i} position={p as [number, number, number]} castShadow>
              <sphereGeometry args={[0.055, 8, 8]} />
              <meshToonMaterial color={color} gradientMap={toonGradient()} />
            </mesh>
          ))}
        </>
      )}
      {style === 'braids' && (
        <>
          {[-0.1, 0.1].map((x) => (
            <mesh key={x} position={[x, 0.02, -0.04]} rotation={[0.4, 0, x > 0 ? 0.2 : -0.2]} castShadow>
              <cylinderGeometry args={[0.025, 0.02, 0.28, 8]} />
              <meshToonMaterial color={color} gradientMap={toonGradient()} />
            </mesh>
          ))}
          <mesh position={[0, 0.12, -0.02]}>
            <sphereGeometry args={[0.12, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
            <meshToonMaterial color={color} gradientMap={toonGradient()} />
          </mesh>
        </>
      )}
      {style === 'spikes' && (
        <>
          {[-0.08, -0.03, 0.03, 0.08].map((x, i) => (
            <mesh key={i} position={[x, 0.16, -0.02]} castShadow>
              <coneGeometry args={[0.035, 0.14, 6]} />
              <meshToonMaterial color={color} gradientMap={toonGradient()} />
            </mesh>
          ))}
        </>
      )}
      {style === 'shaved' && (
        <mesh position={[0, 0.08, -0.02]} scale={[1, 0.35, 1]}>
          <sphereGeometry args={[0.17, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5]} />
          <meshToonMaterial color={color} gradientMap={toonGradient()} transparent opacity={0.55} />
        </mesh>
      )}
    </group>
  );
}
