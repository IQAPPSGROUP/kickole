import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, type Group } from 'three';
import type { SceneId } from '../game/scenes';
import { CROWD } from '../game/set-dressing';
import { ART, useArtTexture } from './art';
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

function PaintedKid({ x, z, phase, art }: { x: number; z: number; phase: number; art: ReturnType<typeof useArtTexture> }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock, camera }) => {
    const hop = Math.max(0, Math.sin(clock.elapsedTime * 16 + phase));
    const group = ref.current;
    if (!group) return;
    group.position.y = hop * fx.cheer * 0.42;
    group.lookAt(camera.position.x, group.position.y + 0.7, camera.position.z);
  });
  return (
    <group ref={ref} position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]}>
        <planeGeometry args={[0.62, 1.15]} />
        <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#FF805D'} transparent alphaTest={0.3} side={DoubleSide} roughness={0.8} />
      </mesh>
    </group>
  );
}

/** A couple of figures outside the kick circle. They hop on cheer milestones. */
export function Spectators({ scene }: { scene: SceneId }) {
  const art = useArtTexture(ART.spectator, true);
  useFrame((_, dt) => { fx.cheer = Math.max(0, fx.cheer - dt * 0.65); });
  const colors = ['#FF805D', '#12BFA6', '#F5C94D'];
  return (
    <group>
      {crowdFor(scene).map((spot, i) => (
        scene === 'beach'
          ? <PaintedKid key={`${spot.x}-${spot.z}`} x={spot.x} z={spot.z} phase={i * 0.9} art={art} />
          : <Kid key={`${spot.x}-${spot.z}`} x={spot.x} z={spot.z} color={colors[i % colors.length]} phase={i * 0.9} />
      ))}
    </group>
  );
}
