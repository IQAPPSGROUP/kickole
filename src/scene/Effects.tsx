import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, type Mesh } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Quality } from '../game/storage';
import { fx } from './fx';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: Color; gravity: number }

const PALETTE = ['#EAF44A', '#12BFA6', '#FF805D', '#F7F5ED'].map((c) => new Color(c));
const DUST = new Color('#9fb3b8');
const dummy = new Object3D();
const scratch = new Color();

/** Particle bursts, ring pulse and camera feedback driven by engine events. */
export function Effects({ engine, quality }: { engine: GameEngine; quality: Quality }) {
  const max = quality === 'high' ? 160 : quality === 'medium' ? 80 : 30;
  const mesh = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const parts = useRef<Particle[]>([]);
  const ringT = useRef(1);
  const colors = useMemo(() => new Float32Array(max * 3), [max]);

  useEffect(() => {
    const spawn = (n: number, x: number, y: number, z: number, speed: number, gravity: number, life: number, dust = false) => {
      for (let i = 0; i < n && parts.current.length < max; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = dust ? 0.2 + Math.random() * 0.5 : Math.random() * 1.2 - 0.2;
        const s = speed * (0.4 + Math.random() * 0.6);
        parts.current.push({
          x, y, z, vx: Math.cos(a) * s, vy: up * s, vz: Math.sin(a) * s,
          life: life * (0.6 + Math.random() * 0.4), max: life, size: dust ? 0.05 + Math.random() * 0.05 : 0.03 + Math.random() * 0.03,
          color: dust ? DUST : PALETTE[(Math.random() * PALETTE.length) | 0], gravity,
        });
      }
    };
    return engine.on((e) => {
      const b = engine.ball;
      if (e.type === 'kick') {
        ringT.current = 0;
        fx.push = Math.max(fx.push, e.grade === 'perfect' ? 1 : 0.35);
        if (e.grade === 'perfect' || e.grade === 'good') {
          const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (!reducedMotion) fx.shake = Math.max(fx.shake, e.grade === 'perfect' ? 1 : 0.45);
          spawn(quality === 'low' ? 5 : e.grade === 'perfect' ? 18 : 10, b.x, b.y, b.z, 2.2, 6, 0.7);
        }
        if (e.streak > 0 && e.streak % 10 === 0) spawn(quality === 'low' ? 15 : 60, b.x, b.y + 0.3, b.z, 3.2, 5, 1.4);
      } else if (e.type === 'drop') {
        fx.shake = 0.7;
        spawn(quality === 'low' ? 6 : 14, b.x, 0.05, b.z, 1.1, 0.5, 0.6, true);
      }
    });
  }, [engine, quality, max]);

  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    const list = parts.current;
    const m = mesh.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.life -= d;
      if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
      p.vy -= p.gravity * d;
      p.x += p.vx * d; p.y = Math.max(0.02, p.y + p.vy * d); p.z += p.vz * d;
    }
    if (m) {
      for (let i = 0; i < max; i++) {
        const p = list[i];
        if (p) {
          const k = Math.max(0, p.life / p.max);
          dummy.position.set(p.x, p.y, p.z);
          dummy.scale.setScalar(p.size * (0.4 + k));
          colors[i * 3] = p.color.r; colors[i * 3 + 1] = p.color.g; colors[i * 3 + 2] = p.color.b;
        } else {
          dummy.position.set(0, -10, 0);
          dummy.scale.setScalar(0.0001);
        }
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, scratch.fromArray(colors, i * 3));
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    const r = ring.current;
    if (r) {
      ringT.current = Math.min(1, ringT.current + d / 0.45);
      const t = ringT.current;
      const b = engine.ball;
      r.visible = t < 1;
      r.position.set(b.x, 0.02, b.z);
      r.scale.setScalar(0.6 + t * 1.6);
      (r.material as unknown as { opacity: number }).opacity = 0.7 * (1 - t);
    }
  });

  return (
    <>
      <instancedMesh
        ref={(m) => { if (m) m.instanceMatrix.setUsage(DynamicDrawUsage); mesh.current = m; }}
        args={[undefined, undefined, max]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 6, 5]} />
        <meshBasicMaterial />
      </instancedMesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.16, 0.2, 40]} />
        <meshBasicMaterial color="#EAF44A" transparent depthWrite={false} />
      </mesh>
    </>
  );
}
