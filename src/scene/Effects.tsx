import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, DynamicDrawUsage, InstancedMesh, Object3D, type Mesh } from 'three';
import type { GameEngine } from '../engine/engine';
import type { Quality } from '../game/storage';
import { fx } from './fx';
import { JUICE_PALETTE, particleBudget, prefersReducedMotion } from './juice';

interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: Color; gravity: number }

const PALETTE = ['#E2F804', '#00F0FF', '#F6F8FA', '#FF4D30', JUICE_PALETTE.gold, JUICE_PALETTE.teal].map((c) => new Color(c));
const FEVER_PALETTE = ['#E2F804', '#00F0FF', '#FF4D30'].map((c) => new Color(c));
const DUST = new Color('#9fb3b8');
const dummy = new Object3D();
const scratch = new Color();

function spawnInto(
  list: Particle[],
  cap: number,
  n: number,
  x: number,
  y: number,
  z: number,
  speed: number,
  gravity: number,
  life: number,
  dust = false,
  fever = false,
) {
  const palette = fever ? FEVER_PALETTE : PALETTE;
  for (let i = 0; i < n && list.length < cap; i++) {
    const a = Math.random() * Math.PI * 2;
    const up = dust ? 0.2 + Math.random() * 0.5 : Math.random() * 1.2 - 0.2;
    const s = speed * (0.4 + Math.random() * 0.6);
    list.push({
      x, y, z, vx: Math.cos(a) * s, vy: up * s, vz: Math.sin(a) * s,
      life: life * (0.6 + Math.random() * 0.4), max: life, size: dust ? 0.05 + Math.random() * 0.05 : 0.03 + Math.random() * 0.03,
      color: dust ? DUST : palette[(Math.random() * palette.length) | 0], gravity,
    });
  }
}

/** Particle bursts, ring pulse and camera feedback driven by engine events. */
export function Effects({ engine, quality }: { engine: GameEngine; quality: Quality }) {
  const reduced = prefersReducedMotion();
  const max = particleBudget(quality, reduced);
  const mesh = useRef<InstancedMesh>(null);
  const ring = useRef<Mesh>(null);
  const flash = useRef<Mesh>(null);
  const parts = useRef<Particle[]>([]);
  const ringT = useRef(1);
  const colors = useMemo(() => new Float32Array(max * 3), [max]);

  useEffect(() => {
    return engine.on((e) => {
      const b = engine.ball;
      const list = parts.current;
      if (e.type === 'kick') {
        ringT.current = 0;
        const inFever = e.streak >= 30;
        spawnInto(list, max, quality === 'low' ? 5 : 8, b.x, b.y - 0.04, b.z, 0.7, 1.4, 0.28, true);
        if (e.grade === 'perfect' || inFever) {
          if (e.grade === 'perfect') fx.shake = 1;
          const count = inFever ? (quality === 'low' ? 12 : 20) : (quality === 'low' ? 8 : 14);
          spawnInto(list, max, count, b.x, b.y, b.z, inFever ? 2.8 : 2.2, 6, 0.75, false, inFever);
        }
        if (e.streak > 0 && e.streak % 10 === 0 && !reduced) {
          spawnInto(list, max, Math.min(24, max), b.x, b.y + 0.3, b.z, 3.6, 5, 1.2, false, e.streak >= 30);
        }
      } else if (e.type === 'drop') {
        fx.shake = 0.7;
        spawnInto(list, max, quality === 'low' ? 6 : 12, b.x, 0.05, b.z, 1.1, 0.5, 0.6, true);
      }
    });
  }, [engine, quality, max, reduced]);

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
    if (fx.confetti > 0) {
      const burst = reduced ? 0 : Math.min(24, max);
      fx.confetti = 0;
      if (burst > 0) spawnInto(list, max, burst, engine.ball.x, Math.max(1.2, engine.ball.y), engine.ball.z, 3.4, 4.5, 1.3);
    }
    if (flash.current) {
      fx.flash = Math.max(0, fx.flash - d * (reduced ? 3.2 : 1.5));
      const mat = flash.current.material as unknown as { opacity: number };
      flash.current.visible = fx.flash > 0.02;
      mat.opacity = fx.flash * (reduced ? 0.12 : 0.28);
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
        <ringGeometry args={[0.16, 0.2, quality === 'low' ? 20 : 40]} />
        <meshBasicMaterial color="#FF4F9A" transparent depthWrite={false} />
      </mesh>
      <mesh ref={flash} position={[0, 1.6, 1.15]} visible={false}>
        <planeGeometry args={[7, 5]} />
        <meshBasicMaterial color="#FFD93D" transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
