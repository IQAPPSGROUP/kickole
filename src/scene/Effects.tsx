import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, type Mesh, type MeshBasicMaterial } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Quality } from '../game/storage';
import { cameraKickFor } from './camera-motion';
import { fx } from './fx';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: Color; gravity: number }

const PALETTE = ['#EAF44A', '#12BFA6', '#FF805D', '#F7F5ED', '#F5C94D'].map((c) => new Color(c));
const GOLD = new Color('#F5C94D');
const TEAL = new Color('#7CFFF0');
const DUST = new Color('#c4b39a');
const dummy = new Object3D();
const scratch = new Color();

/** Particle bursts, ring pulse and camera feedback driven by engine events. */
export function Effects({ engine, quality }: { engine: GameEngine; quality: Quality }) {
  const max = quality === 'high' ? 180 : quality === 'medium' ? 90 : 28;
  const mesh = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const parts = useRef<Particle[]>([]);
  const ringT = useRef(1);
  const ringColor = useRef('#EAF44A');
  const colors = useMemo(() => new Float32Array(max * 3), [max]);

  useEffect(() => {
    const spawn = (n: number, x: number, y: number, z: number, speed: number, gravity: number, life: number, color?: Color) => {
      for (let i = 0; i < n && parts.current.length < max; i++) {
        const a = Math.random() * Math.PI * 2;
        const up = color === DUST ? 0.2 + Math.random() * 0.5 : 0.15 + Math.random() * 1.15;
        const s = speed * (0.4 + Math.random() * 0.6);
        parts.current.push({
          x, y, z, vx: Math.cos(a) * s, vy: up * s, vz: Math.sin(a) * s,
          life: life * (0.6 + Math.random() * 0.4), max: life,
          size: color === DUST ? 0.05 + Math.random() * 0.05 : 0.035 + Math.random() * 0.045,
          color: color ?? PALETTE[(Math.random() * PALETTE.length) | 0],
          gravity,
        });
      }
    };
    return engine.on((e) => {
      const b = engine.ball;
      const budget = quality === 'low' ? 0.45 : 1;
      if (e.type === 'kick') {
        const kick = cameraKickFor(e, quality);
        fx.push = Math.max(fx.push, kick.push);
        fx.shake = Math.max(fx.shake, kick.shake);
        fx.celebrate = Math.max(fx.celebrate, kick.celebrate);
        fx.sway = kick.sway;
        ringT.current = 0;
        ringColor.current = e.stall ? '#F5C94D' : e.grade === 'perfect' ? '#EAF44A' : e.alternate ? '#12BFA6' : '#F7F5ED';
        if (e.grade === 'perfect') spawn(Math.round(16 * budget), b.x, b.y, b.z, 2.4, 5, 0.75, GOLD);
        if (e.stall) spawn(Math.round(14 * budget), b.x, b.y, b.z, 1.4, 2.5, 0.8, GOLD);
        if (e.alternate) spawn(Math.round(10 * budget), b.x, b.y + 0.1, b.z, 2.8, 4, 0.55, TEAL);
        if (e.streak > 0 && e.streak % 5 === 0) spawn(Math.round((e.streak % 10 === 0 ? 36 : 12) * budget), b.x, b.y + 0.4, b.z, 3.4, 4, 1.1);
      } else if (e.type === 'stallStart') {
        fx.celebrate = Math.max(fx.celebrate, quality === 'low' ? 0.25 : 0.4);
        ringT.current = 0;
        ringColor.current = '#F5C94D';
        spawn(Math.round(8 * budget), b.x, 0.08, b.z, 0.8, 1, 0.45, DUST);
      } else if (e.type === 'miss') {
        fx.shake = Math.max(fx.shake, quality === 'low' ? 0 : 0.22);
        spawn(Math.round(5 * budget), b.x, b.y, b.z, 0.6, 2, 0.3, DUST);
      } else if (e.type === 'drop') {
        fx.shake = quality === 'low' ? 0 : 0.7;
        fx.celebrate = 0;
        spawn(Math.round(12 * budget), b.x, 0.05, b.z, 1.2, 0.5, 0.6, DUST);
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
    const ringMesh = ring.current;
    if (ringMesh) {
      const stalling = engine.contact?.kind === 'stall';
      const mat = ringMesh.material as MeshBasicMaterial;
      if (stalling) {
        const pulse = 0.85 + Math.sin(engine.time * 14) * 0.12;
        ringMesh.visible = true;
        ringMesh.position.set(engine.ball.x, 0.025, engine.ball.z);
        ringMesh.scale.setScalar(pulse);
        mat.color.set('#F5C94D');
        mat.opacity = 0.75;
      } else {
        ringT.current = Math.min(1, ringT.current + d / 0.5);
        const t = ringT.current;
        ringMesh.visible = t < 1;
        ringMesh.position.set(engine.ball.x, 0.02, engine.ball.z);
        ringMesh.scale.setScalar(0.55 + t * 1.8);
        mat.color.set(ringColor.current);
        mat.opacity = 0.75 * (1 - t);
      }
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
        <ringGeometry args={[0.18, 0.24, quality === 'low' ? 20 : 40]} />
        <meshBasicMaterial color="#EAF44A" transparent depthWrite={false} />
      </mesh>
    </>
  );
}
