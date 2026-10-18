import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { SceneId } from '../game/scenes';
import { CROWD } from '../game/set-dressing';
import { fx } from './fx';

function crowdFor(scene: SceneId) {
  switch (scene) {
    case 'beach':
      return CROWD.beach;
    case 'rua':
      return CROWD.rua;
    default: {
      const exhaustive: never = scene;
      return exhaustive;
    }
  }
}

function Kid({ x, z, color, phase }: { x: number; z: number; color: string; phase: number }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const hop = Math.max(0, Math.sin(clock.elapsedTime * 16 + phase));
    if (ref.current) ref.current.position.y = hop * fx.cheer * 0.42;
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 0.42, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.46, 8]} />
        <meshStandardMaterial color={color} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.78, 0]}>
        <sphereGeometry args={[0.13, 8, 6]} />
        <meshStandardMaterial color="#e8b48f" roughness={0.6} />
      </mesh>
    </group>
  );
}

/** A couple of figures outside the kick circle. They hop on cheer milestones. */
export function Spectators({ scene }: { scene: SceneId }) {
  useFrame((_, dt) => { fx.cheer = Math.max(0, fx.cheer - dt * 0.65); });
  const colors = ['#FF805D', '#12BFA6', '#F5C94D'];
  return (
    <group>
      {crowdFor(scene).map((spot, i) => (
        <Kid key={`${spot.x}-${spot.z}`} x={spot.x} z={spot.z} color={colors[i % colors.length]} phase={i * 0.9} />
      ))}
    </group>
  );
}
