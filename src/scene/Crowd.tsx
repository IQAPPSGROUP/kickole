import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, InstancedMesh, Object3D } from 'three';

const SHIRTS = ['#6e4b3a', '#2f3d4a', '#8a4a3a', '#3d5348', '#c4b49a', '#1e2430', '#a36b45', '#4d5d73'];
const SKIN = ['#8d5524', '#c68642', '#e0ac69', '#f1c27d', '#ffdbac', '#5c3317'];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Instanced spectators outside the touchlines. One body draw and one head draw.
 * Count comes from the quality tier so low devices stay light.
 */
export function Crowd({ count }: { count: number }) {
  const body = useRef<InstancedMesh>(null);
  const head = useRef<InstancedMesh>(null);
  const layout = useMemo(() => {
    const random = mulberry32(1962);
    const dummy = new Object3D();
    const bodies: { matrix: number[]; color: string }[] = [];
    const heads: { matrix: number[]; color: string }[] = [];
    for (let i = 0; i < count; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const row = Math.floor(i / 2);
      const rows = Math.ceil(count / 2);
      const along = (row / Math.max(1, rows - 1) - 0.5) * 7.4;
      const scale = 0.86 + random() * 0.22;
      const x = side * (5.05 + random() * 0.25);
      const z = along + (random() - 0.5) * 0.2;
      dummy.position.set(x, 0.72 * scale, z);
      dummy.rotation.set(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      bodies.push({ matrix: dummy.matrix.toArray(), color: SHIRTS[i % SHIRTS.length] });
      dummy.position.set(x, 1.28 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      heads.push({ matrix: dummy.matrix.toArray(), color: SKIN[Math.floor(random() * SKIN.length)] });
    }
    return { bodies, heads };
  }, [count]);

  useLayoutEffect(() => {
    const color = new Color();
    const apply = (mesh: InstancedMesh | null, items: { matrix: number[]; color: string }[]) => {
      if (!mesh) return;
      items.forEach((item, i) => {
        scratch.matrix.fromArray(item.matrix);
        mesh.setMatrixAt(i, scratch.matrix);
        mesh.setColorAt(i, color.set(item.color));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };
    apply(body.current, layout.bodies);
    apply(head.current, layout.heads);
  }, [layout]);

  if (count <= 0) return null;
  return (
    <group>
      <instancedMesh ref={body} args={[undefined, undefined, count]} frustumCulled={false}>
        <capsuleGeometry args={[0.18, 0.62, 3, 6]} />
        <meshStandardMaterial roughness={0.82} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={head} args={[undefined, undefined, count]} frustumCulled={false}>
        <sphereGeometry args={[0.13, 8, 6]} />
        <meshStandardMaterial roughness={0.7} metalness={0} />
      </instancedMesh>
    </group>
  );
}

const scratch = new Object3D();
