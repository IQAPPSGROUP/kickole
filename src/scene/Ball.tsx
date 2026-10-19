import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Euler, Matrix4, Quaternion, Vector3, type Group, type Mesh } from 'three';
import { comboHeat } from './juice';
import { toonGradient } from './toon';
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

export function Ball({ engine, skin, quality }: { engine: GameEngine; skin: Skin; quality: Quality }) {
  const flash = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const streak = useRef<Mesh>(null);
  const r = engine.config.ballRadius;
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), []);
  const streakDir = useMemo(() => new Vector3(), []);
  const streakQuat = useMemo(() => new Quaternion(), []);
  const up = useMemo(() => new Vector3(0, 1, 0), []);

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
    {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const heat = comboHeat(engine.streak);
      const mesh = streak.current;
      if (mesh) {
        const len = Math.min(0.38, Math.max(0, speed - 1.4) * 0.05);
        const show = len > 0.04 && engine.phase === 'playing' && quality !== 'low';
        mesh.visible = show;
        if (show) {
          streakDir.set(b.vx, b.vy, b.vz).normalize();
          streakQuat.setFromUnitVectors(up, streakDir);
          mesh.quaternion.copy(streakQuat);
          mesh.position.set(
            b.x - streakDir.x * (r + len * 0.45),
            b.y - streakDir.y * (r + len * 0.45),
            b.z - streakDir.z * (r + len * 0.45),
          );
          mesh.scale.set(1, len, 1);
          const mat = mesh.material as unknown as { opacity: number; color: { set: (c: string) => void } };
          mat.color.set(heat.t > 0.35 ? heat.color : '#F7F5ED');
          mat.opacity = Math.min(0.55, 0.18 + len);
        }
      }
    }
    if (shadow.current) {
      const h = Math.max(0, b.y - r);
      const s = 1 / (1 + h * 2.6);
      shadow.current.position.set(b.x, 0.012, b.z);
      shadow.current.scale.set(s, s, s);
      (shadow.current.material as unknown as { opacity: number }).opacity = 0.62 * s;
    }
  });

  return (
    <>
      <group ref={group}>
        <mesh ref={flash} visible={false}>
          <sphereGeometry args={[r * 1.8, 12, 10]} />
          <meshBasicMaterial color="#FFD93D" transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={spin}>
          <mesh castShadow>
            <sphereGeometry args={[r, 32, 24]} />
            <meshToonMaterial color={skin.football.base} gradientMap={toonGradient()} />
          </mesh>
          {panels.map((p, i) => (
            <mesh key={i} position={p.pos} quaternion={p.q}>
              <circleGeometry args={[r * (i % 2 === 0 ? 0.46 : 0.34), 5]} />
              <meshToonMaterial color={i % 2 === 0 ? skin.football.panels : '#1E2A5A'} gradientMap={toonGradient()} />
            </mesh>
          ))}
        </group>
      </group>
      <mesh ref={streak} visible={false}>
        <boxGeometry args={[0.035, 1, 0.035]} />
        <meshBasicMaterial color="#F7F5ED" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 1.15, 24]} />
        <meshBasicMaterial color="#142033" transparent opacity={0.55} depthWrite={false} />
      </mesh>
    </>
  );
}
