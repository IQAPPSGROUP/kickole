import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Matrix4, Quaternion, Vector3, type Group, type Mesh } from 'three';
import type { Quality } from '../game/storage';
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

const TRAIL = 6;

export function Ball({ engine, skin, quality }: { engine: GameEngine; skin: Skin; quality: Quality }) {
  const trail = useRef<Array<Mesh | null>>([]);
  const hist = useRef<Vector3[]>(Array.from({ length: TRAIL * 2 }, () => new Vector3()));
  const flash = useRef<Mesh>(null);
  const showTrail = quality !== 'low';
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
    // Contact squash and flash: strongest right after the ball response.
    const since = engine.time - Math.max(engine.lastContact.left, engine.lastContact.right);
    const k = since >= 0 && since < 0.12 ? Math.sin((since / 0.12) * Math.PI) : 0;
    if (group.current) group.current.scale.set(1 + 0.18 * k, 1 - 0.22 * k, 1 + 0.18 * k);
    if (flash.current) {
      flash.current.visible = k > 0.05 && engine.lastKickGrade !== 'miss';
      flash.current.scale.setScalar(0.6 + k * 1.4);
      (flash.current.material as unknown as { opacity: number }).opacity = 0.8 * k;
    }
    if (showTrail) {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const h = hist.current;
      for (let i = h.length - 1; i > 0; i--) h[i].copy(h[i - 1]);
      h[0].set(b.x, b.y, b.z);
      for (let i = 0; i < TRAIL; i++) {
        const m = trail.current[i];
        if (!m) continue;
        const p = h[(i + 1) * 2 - 1];
        m.visible = speed > 3.2 && engine.phase === 'playing';
        m.position.copy(p);
        m.scale.setScalar(1 - (i + 1) / (TRAIL + 1));
        (m.material as unknown as { opacity: number }).opacity = 0.28 * (1 - i / TRAIL);
      }
    }
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
        <mesh ref={flash} visible={false}>
          <sphereGeometry args={[r * 1.8, 12, 10]} />
          <meshBasicMaterial color="#EAF44A" transparent opacity={0} depthWrite={false} />
        </mesh>
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
      {showTrail && Array.from({ length: TRAIL }, (_, i) => (
        <mesh key={i} ref={(m) => { trail.current[i] = m; }} visible={false}>
          <sphereGeometry args={[r, 12, 10]} />
          <meshBasicMaterial color={skin.football.base} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 1.25, 24]} />
        <meshBasicMaterial color="#05161b" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  );
}
