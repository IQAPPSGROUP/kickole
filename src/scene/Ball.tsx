import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Matrix4, Quaternion, Vector3, type Group, type Mesh } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';

const PHI = (1 + Math.sqrt(5)) / 2;
/** Icosahedron vertices: where the dark pentagon panels sit. */
const PANEL_DIRS: Vector3[] = (() => {
  const v: Array<[number, number, number]> = [];
  for (const a of [-1, 1]) for (const b of [-PHI, PHI]) {
    v.push([0, a, b], [a, b, 0], [b, 0, a]);
  }
  return v.map(([x, y, z]) => new Vector3(x, y, z).normalize());
})();

export function Ball({ engine, skin }: { engine: GameEngine; skin: Skin }) {
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const r = engine.config.ballRadius;
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), []);

  const panels = useMemo(() => {
    const m = new Matrix4();
    return PANEL_DIRS.map((d) => {
      m.lookAt(new Vector3(0, 0, 0), d, new Vector3(0, 1, 0));
      const q = new Quaternion().setFromRotationMatrix(m);
      return { pos: d.clone().multiplyScalar(r * 1.002), q };
    });
  }, [r]);

  useFrame(() => {
    const b = engine.ball;
    if (group.current) group.current.position.set(b.x, b.y, b.z);
    if (spin.current) { euler.set(b.rx, b.ry, b.rz); spin.current.rotation.copy(euler); }
    if (shadow.current) {
      const h = Math.max(0, b.y - r);
      const s = 1 / (1 + h * 0.9);
      shadow.current.position.set(b.x, 0.012, b.z);
      shadow.current.scale.set(s, s, s);
      (shadow.current.material as unknown as { opacity: number }).opacity = 0.4 * s;
    }
  });

  return (
    <>
      <group ref={group}>
        <group ref={spin}>
          <mesh castShadow>
            <sphereGeometry args={[r, 32, 24]} />
            <meshStandardMaterial color={skin.football.base} roughness={0.45} />
          </mesh>
          {panels.map((p, i) => (
            <mesh key={i} position={p.pos} quaternion={p.q}>
              <circleGeometry args={[r * 0.36, 5]} />
              <meshStandardMaterial color={skin.football.panels} roughness={0.5} />
            </mesh>
          ))}
        </group>
      </group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 1.25, 24]} />
        <meshBasicMaterial color="#05161b" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  );
}
