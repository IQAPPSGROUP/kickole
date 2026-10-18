import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, Euler, RepeatWrapping, SRGBColorSpace, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Quality } from '../game/storage';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';

const TRAIL = 8;

function makeBallTexture(base: string, panels: string) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = base;
    g.fillRect(0, 0, 512, 256);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 5;
    g.fillStyle = panels;
    const drawPent = (x: number, y: number, r: number) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = x + Math.cos(a) * r;
        const py = y + Math.sin(a) * r;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
      g.stroke();
    };
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const x = ((col + (row % 2 ? 0.5 : 0)) / 6) * 512;
        const y = ((row + 0.5) / 3) * 256;
        drawPent(x, y, row === 1 ? 28 : 24);
      }
    }
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, 128);
    g.lineTo(512, 128);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function flashColor(engine: GameEngine): string {
  if (engine.contact?.kind === 'stall') return '#F5C94D';
  if (engine.lastKickGrade === 'perfect') return '#EAF44A';
  if (engine.lastKickGrade === 'good') return '#12BFA6';
  return '#FF805D';
}

export function Ball({ engine, skin, quality }: { engine: GameEngine; skin: Skin; quality: Quality }) {
  const trailCount = quality === 'high' ? TRAIL : quality === 'medium' ? 5 : 0;
  const trail = useRef<Array<Mesh | null>>([]);
  const hist = useRef<Vector3Slot[]>(Array.from({ length: TRAIL * 2 }, () => ({ x: 0, y: 0, z: 0 })));
  const flash = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const r = engine.config.ballRadius;
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), []);
  const tint = useMemo(() => new Color(), []);
  const map = useMemo(() => makeBallTexture(skin.football.base, skin.football.panels), [skin.football.base, skin.football.panels]);
  useEffect(() => () => map.dispose(), [map]);

  useFrame(() => {
    const b = engine.ball;
    if (group.current) group.current.position.set(b.x, b.y, b.z);
    if (spin.current) { euler.set(b.rx, b.ry, b.rz); spin.current.rotation.copy(euler); }
    const since = engine.time - Math.max(engine.lastContact.left, engine.lastContact.right);
    const k = since >= 0 && since < 0.12 ? Math.sin((since / 0.12) * Math.PI) : 0;
    if (group.current) group.current.scale.set(1 + 0.18 * k, 1 - 0.22 * k, 1 + 0.18 * k);
    if (flash.current) {
      const show = (k > 0.05 && engine.lastKickGrade !== 'miss') || engine.contact?.kind === 'stall';
      flash.current.visible = show;
      const pulse = engine.contact?.kind === 'stall' ? 0.55 + Math.sin(engine.time * 16) * 0.2 : k;
      flash.current.scale.setScalar(0.7 + pulse * 1.5);
      const mat = flash.current.material as MeshBasicMaterial;
      mat.opacity = engine.contact?.kind === 'stall' ? 0.45 : 0.8 * k;
      mat.color.set(flashColor(engine));
    }
    if (trailCount > 0) {
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const h = hist.current;
      for (let i = h.length - 1; i > 0; i--) { h[i].x = h[i - 1].x; h[i].y = h[i - 1].y; h[i].z = h[i - 1].z; }
      h[0].x = b.x; h[0].y = b.y; h[0].z = b.z;
      for (let i = 0; i < trailCount; i++) {
        const m = trail.current[i];
        if (!m) continue;
        const p = h[(i + 1) * 2 - 1];
        m.visible = speed > 2.4 && engine.phase === 'playing';
        m.position.set(p.x, p.y, p.z);
        const fade = 1 - (i + 1) / (trailCount + 1);
        m.scale.setScalar(fade);
        (m.material as MeshBasicMaterial).opacity = 0.4 * fade;
      }
    }
    if (shadow.current) {
      const height = Math.max(0, b.y - r);
      const s = 1 / (1 + height * 0.9);
      shadow.current.position.set(b.x, 0.012, b.z);
      shadow.current.scale.set(s, s, s);
      const mat = shadow.current.material as MeshBasicMaterial;
      mat.opacity = (quality === 'high' ? 0.22 : 0.42) * s;
      mat.color.copy(tint.set(quality === 'low' ? '#05161b' : '#1a120c'));
    }
  });

  const glossy = quality === 'high';

  return (
    <>
      <group ref={group}>
        <mesh ref={flash} visible={false}>
          <sphereGeometry args={[r * 1.85, 12, 10]} />
          <meshBasicMaterial color="#EAF44A" transparent opacity={0} depthWrite={false} />
        </mesh>
        <group ref={spin}>
          <mesh castShadow>
            <sphereGeometry args={[r, glossy ? 32 : 24, glossy ? 24 : 16]} />
            {glossy ? (
              <meshPhysicalMaterial
                map={map}
                roughness={0.28}
                metalness={0.04}
                clearcoat={0.55}
                clearcoatRoughness={0.28}
                emissive={skin.football.base}
                emissiveIntensity={0.05}
              />
            ) : (
              <meshStandardMaterial map={map} roughness={0.38} metalness={0.02} emissive={skin.football.base} emissiveIntensity={0.06} />
            )}
          </mesh>
        </group>
      </group>
      {trailCount > 0 && Array.from({ length: trailCount }, (_, i) => (
        <mesh key={i} ref={(m) => { trail.current[i] = m; }} visible={false}>
          <sphereGeometry args={[r * 0.85, 10, 8]} />
          <meshBasicMaterial color={skin.football.base} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      ))}
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[r * 1.35, 20]} />
        <meshBasicMaterial color="#05161b" transparent opacity={0.4} depthWrite={false} />
      </mesh>
    </>
  );
}

interface Vector3Slot { x: number; y: number; z: number }
