import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, InstancedMesh, Object3D } from 'three';
import type { CrowdLod } from './qualityTier';
import { crowdModel, crowdPlacements, type Spectator } from './streetLayout';
import { useStreetNodes, type StreetNode } from './streetMaterials';
import { prefersReducedMotion } from './juice';

const dummy = new Object3D();
const tint = new Color();

function partPeople(name: string, lod: CrowdLod, people: Spectator[]): Spectator[] {
  if (name === 'Hat') return people.filter((person) => person.hat);
  if (name === 'Afro') return people.filter((person) => person.afro);
  if (name === 'Hair' && lod === 0) return people.filter((person) => !person.hat && !person.afro);
  return people;
}

function partColor(name: string, person: Spectator): string {
  switch (name) {
    case 'Torso':
    case 'Body':
      return person.shirt;
    case 'Shorts':
      return person.shorts;
    case 'Head':
    case 'ArmL':
    case 'ArmR':
    case 'LegL':
    case 'LegR':
      return person.skin;
    case 'Hair':
    case 'Afro':
      return person.hair;
    case 'Hat':
      return person.hatColor;
    default:
      return person.shirt;
  }
}

function CrowdPart({ node, people, lod, idle }: { node: StreetNode; people: Spectator[]; lod: CrowdLod; idle: boolean }) {
  const meshRef = useRef<InstancedMesh>(null);
  const mine = useMemo(() => partPeople(node.name, lod, people), [node.name, lod, people]);
  const paint = (time: number, colors: boolean) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const swayOn = idle && !prefersReducedMotion();
    for (let i = 0; i < mine.length; i++) {
      const person = mine[i];
      if (!person) continue;
      const bob = swayOn ? Math.sin(time * 1.55 + person.phase) * 0.018 : 0;
      const lean = swayOn ? Math.sin(time * 1.1 + person.phase) * 0.045 : 0;
      const swing = swayOn ? Math.sin(time * 1.85 + person.phase) * 0.32 : 0;
      let rx = 0;
      let ry = person.yaw;
      let rz = 0;
      if (node.name === 'ArmL') rx = swing;
      else if (node.name === 'ArmR') rx = -swing;
      else if (node.name === 'Torso' || node.name === 'Body' || node.name === 'Shorts') rz = lean;
      else if (node.name === 'Head' || node.name === 'Hair' || node.name === 'Afro' || node.name === 'Hat') {
        rz = -lean * 0.45;
        ry += Math.sin(time * 0.6 + person.phase) * (swayOn ? 0.12 : 0);
      }
      dummy.rotation.order = 'YXZ';
      const yLift = lod === 2 ? 0.5 : 0;
      dummy.position.set(
        person.x + node.pivot[0] * person.scale,
        person.y + yLift + node.pivot[1] * person.scale + bob,
        person.z + node.pivot[2] * person.scale,
      );
      dummy.rotation.set(rx, ry, rz);
      const bulk = node.name === 'Afro' ? 1.08 : 1;
      const fitted = person.scale * bulk;
      dummy.scale.set(node.scale[0] * fitted, node.scale[1] * fitted, node.scale[2] * fitted);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colors) mesh.setColorAt(i, tint.set(partColor(node.name, person)));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(() => { paint(0, true); }, [mine, node, idle]);
  useFrame((state) => {
    if (!idle || prefersReducedMotion()) return;
    paint(state.clock.elapsedTime, false);
  });
  if (mine.length === 0) return null;
  const rough = node.name === 'Hair' || node.name === 'Afro' || node.name === 'Hat' ? 0.58 : 0.74;
  return (
    <instancedMesh ref={meshRef} args={[node.geometry, undefined, mine.length]} frustumCulled={false}>
      <meshStandardMaterial roughness={rough} metalness={0} />
    </instancedMesh>
  );
}

/**
 * Instanced spectators. High uses the detailed mesh and an idle sway.
 * Medium and low swap in smaller LODs. Everyone stands outside the play box.
 */
export function Crowd({ count, lod, idle }: { count: number; lod: CrowdLod; idle: boolean }) {
  const people = useMemo(() => crowdPlacements(count), [count]);
  const nodes = useStreetNodes(count > 0 ? crowdModel(lod) : null);
  if (count <= 0 || nodes.length === 0) return null;
  return (
    <group>
      {nodes.map((node) => (
        <CrowdPart key={`${lod}-${node.name}`} node={node} people={people} lod={lod} idle={idle} />
      ))}
    </group>
  );
}
