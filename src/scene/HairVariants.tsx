import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Group, type Bone, type BufferGeometry, type Object3D } from 'three';
import type { HairStyle } from '../game/appearance';
import { hairSpring } from './secondaryMotion';
import { createHairGeometry, hairParts, type HairBody, type HairPart } from './hairFit';

/**
 * Procedural hair silhouettes parented to the head bone so they follow every animation.
 * The authored Hair material mesh is hidden when a non-short style is active.
 * Placements come from hairFit so the face volume stays clear on both skulls.
 */
export function HairVariants({
  head,
  style,
  color,
  hairMesh,
  body = 'male',
}: {
  head: Bone | Object3D | undefined;
  style: HairStyle;
  color: string;
  hairMesh?: Object3D[];
  body?: HairBody;
}) {
  const group = useRef<Group>(null);
  const parts = useMemo(() => hairParts(style, body), [style, body]);

  useLayoutEffect(() => {
    if (!head || !group.current) return;
    head.add(group.current);
    return () => {
      if (group.current) head.remove(group.current);
    };
  }, [head]);

  useFrame(() => {
    const hideAuthored = style !== 'short';
    if (hairMesh) for (const mesh of hairMesh) mesh.visible = !hideAuthored;
    if (group.current) {
      group.current.visible = parts.length > 0;
      group.current.rotation.set(hairSpring.pitch, hairSpring.yaw, hairSpring.roll);
    }
  });

  if (!head) return null;

  return (
    <group ref={group}>
      {parts.map((part) => (
        <HairPartMesh key={part.id} part={part} color={color} />
      ))}
    </group>
  );
}

function HairPartMesh({ part, color }: { part: HairPart; color: string }) {
  const geometry = useMemo(() => createHairGeometry(part), [part]);
  useEffect(() => () => disposeGeometry(geometry), [geometry]);
  const rotation: [number, number, number] = part.rotation ?? [0, 0, 0];
  const scale: [number, number, number] = part.shape === 'sphere' ? (part.scale ?? [1, 1, 1]) : [1, 1, 1];
  return (
    <mesh
      name={`hair-${part.id}`}
      geometry={geometry}
      position={part.position}
      rotation={rotation}
      scale={scale}
      castShadow
    >
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        metalness={0}
        envMapIntensity={0.35}
        side={DoubleSide}
      />
    </mesh>
  );
}

function disposeGeometry(geometry: BufferGeometry) {
  geometry.dispose();
}
