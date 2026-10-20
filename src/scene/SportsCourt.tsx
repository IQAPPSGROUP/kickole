import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, InstancedMesh, Object3D } from 'three';
import type { Quality } from '../game/storage';
import { CarnivalDressing, CourtLines } from './Court';
import { prefersReducedMotion, sceneLifeBudget } from './juice';
import { courtFencePosts, courtFenceSlots, grassMapSet, trackMapSet } from './locations';
import { profileFor } from './qualityTier';
import { fenceModel, LAMP_SPOTS, STREET_FILES, streetUrl, type FenceSlot } from './streetLayout';
import { useStreetMaps, useStreetNodes } from './streetMaterials';

const slotDummy = new Object3D();

function Cage({ geometry, pivot, scale, slots, color, metalness, roughness }: {
  geometry: BufferGeometry;
  pivot: [number, number, number];
  scale: [number, number, number];
  slots: FenceSlot[];
  color: string;
  metalness: number;
  roughness: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    slots.forEach((slot, index) => {
      slotDummy.position.set(slot.x + pivot[0], slot.y + pivot[1], slot.z + pivot[2]);
      slotDummy.rotation.set(0, slot.ry, 0);
      slotDummy.scale.set(scale[0], scale[1], scale[2]);
      slotDummy.updateMatrix();
      mesh.setMatrixAt(index, slotDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [slots, pivot, scale]);
  if (slots.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, slots.length]} frustumCulled={false} castShadow>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={1.05} />
    </instancedMesh>
  );
}

/**
 * Athletics court in a park. Red rubber inside photographed grass, open to the park sky.
 */
export function SportsCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const profile = profileFor(quality);
  const maps = trackMapSet(quality);
  const grassMaps = grassMapSet(quality);
  const track = useStreetMaps(maps.color, maps.normal, maps.rough, 5, 4);
  const grass = useStreetMaps(grassMaps.color, grassMaps.normal, grassMaps.rough, 7, 7);
  const fenceNodes = useStreetNodes(fenceModel(profile.fence));
  const lampNodes = useStreetNodes(quality === 'low' ? null : streetUrl(STREET_FILES.lamp));
  const panel = fenceNodes.find((node) => node.name === 'Panel');
  const post = fenceNodes.find((node) => node.name === 'Post');
  const slots = useMemo(() => courtFenceSlots(profile.fence), [profile.fence]);
  const posts = useMemo(() => courtFencePosts(profile.fence), [profile.fence]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.03, 0]} receiveShadow={shadows}>
        <planeGeometry args={[28, 22]} />
        <meshStandardMaterial
          map={grass.color ?? undefined}
          normalMap={grass.normal ?? undefined}
          roughnessMap={grass.rough ?? undefined}
          color={grass.color ? '#ffffff' : '#6a7344'}
          roughness={grass.rough ? 0.92 : 0.9}
          metalness={0}
          envMapIntensity={0.16}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0.15]} receiveShadow={shadows}>
        <planeGeometry args={[11.2, 8.4]} />
        <meshStandardMaterial
          map={track.color ?? undefined}
          normalMap={track.normal ?? undefined}
          roughnessMap={track.rough ?? undefined}
          color={track.color ? '#ffffff' : '#9a3c32'}
          roughness={track.rough ? 0.84 : 0.8}
          metalness={0.02}
          envMapIntensity={0.14}
        />
      </mesh>
      <CourtLines />
      {panel && <Cage geometry={panel.geometry} pivot={panel.pivot} scale={panel.scale} slots={slots} color="#d5dee4" metalness={0.72} roughness={0.32} />}
      {post && <Cage geometry={post.geometry} pivot={post.pivot} scale={post.scale} slots={posts} color="#9aa3a8" metalness={0.8} roughness={0.34} />}
      <CarnivalDressing sway={sceneLifeBudget(quality, prefersReducedMotion()).buntingSway} />
      {lampNodes.map((node) => (
        LAMP_SPOTS.map((spot) => (
          <group key={`${node.name}-${spot.x}`} position={[spot.x, 0, spot.z]} rotation={[0, spot.ry, 0]}>
            <mesh geometry={node.geometry} position={node.pivot} scale={node.scale} castShadow={node.name !== 'Lens'}>
              {node.name === 'Lens'
                ? <meshStandardMaterial color="#fff1d2" emissive="#ffc56a" emissiveIntensity={profile.lamp === 'lit' ? 2.4 : 1.2} roughness={0.24} />
                : <meshStandardMaterial color="#c5ced2" metalness={0.8} roughness={0.34} envMapIntensity={1.1} />}
            </mesh>
          </group>
        ))
      ))}
    </group>
  );
}
