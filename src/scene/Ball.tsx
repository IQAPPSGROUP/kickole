import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { AdditiveBlending, CanvasTexture, Color, Euler, RepeatWrapping, SRGBColorSpace, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import type { Quality } from '../game/storage';
import type { GameEngine } from '../engine/engine';
import type { Skin } from '../game/skins';

const TRAIL = 8;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function glintOpacity(quality: Quality): number {
  switch (quality) {
    case 'low': return 0.22;
    case 'medium': return 0.34;
    case 'high': return 0.46;
    default: {
      const exhaustive: never = quality;
      return exhaustive;
    }
  }
}

function makeBallTexture(base: string, panels: string, quality: Quality) {
  const w = 512;
  const h = 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (g) {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const rand = mulberry32(11);
    const specks = quality === 'low' ? 700 : 2000;
    for (let i = 0; i < specks; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const alpha = 0.05 + rand() * 0.1;
      g.fillStyle = rand() > 0.55 ? `rgba(92,64,38,${alpha})` : `rgba(255,250,240,${alpha})`;
      const s = 1 + Math.floor(rand() * 3);
      g.fillRect(x, y, s, s);
    }
    const drawPent = (x: number, y: number, radius: number) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        const px = x + Math.cos(a) * radius;
        const py = y + Math.sin(a) * radius;
        if (i === 0) g.moveTo(px, py);
        else g.lineTo(px, py);
      }
      g.closePath();
    };
    g.lineJoin = 'round';
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 6; col++) {
        const x = ((col + (row % 2 ? 0.5 : 0)) / 6) * w;
        const y = ((row + 0.5) / 3) * h;
        const radius = row === 1 ? 34 : 30;
        g.fillStyle = 'rgba(8,12,16,0.94)';
        drawPent(x, y, radius + 6);
        g.fill();
        g.fillStyle = panels;
        drawPent(x, y, radius);
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(255,255,255,0.62)';
        g.stroke();
      }
    }
    g.strokeStyle = 'rgba(8,12,16,0.55)';
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
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
  const { camera } = useThree();
  const trail = useRef<Array<Mesh | null>>([]);
  const hist = useRef<Vector3Slot[]>(Array.from({ length: TRAIL * 2 }, () => ({ x: 0, y: 0, z: 0 })));
  const flash = useRef<Mesh>(null);
  const glint = useRef<Mesh>(null);
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  const r = engine.config.ballRadius;
  const euler = useMemo(() => new Euler(0, 0, 0, 'XYZ'), []);
  const tint = useMemo(() => new Color(), []);
  const glintDir = useMemo(() => new Vector3(), []);
  const map = useMemo(() => makeBallTexture(skin.football.base, skin.football.panels, quality), [skin.football.base, skin.football.panels, quality]);
  useEffect(() => () => map.dispose(), [map]);

  useFrame(() => {
    const b = engine.ball;
    if (group.current) group.current.position.set(b.x, b.y, b.z);
    if (glint.current && group.current) {
      glintDir.copy(camera.position).sub(group.current.position);
      if (glintDir.lengthSq() > 1e-6) {
        glintDir.normalize().multiplyScalar(r * 0.82);
        glint.current.position.copy(glintDir);
      }
    }
    if (spin.current) { euler.set(b.rx, b.ry, b.rz); spin.current.rotation.copy(euler); }
    const since = engine.time - Math.max(engine.lastContact.left, engine.lastContact.right);
    const k = since >= 0 && since < 0.12 ? Math.sin((since / 0.12) * Math.PI) : 0;
    if (group.current) group.current.scale.set(1 + 0.18 * k, 1 - 0.22 * k, 1 + 0.18 * k);
    if (flash.current) {
      const show = (k > 0.05 && engine.lastKickGrade !== 'miss') || engine.contact?.kind === 'stall';
      flash.current.visible = show;
      const pulse = engine.contact?.kind === 'stall' ? 0.55 + Math.sin(engine.time * 16) * 0.2 : k;
      flash.current.scale.setScalar(0.45 + pulse * 0.65);
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
          <sphereGeometry args={[r * 1.35, 12, 10]} />
          <meshBasicMaterial color="#EAF44A" transparent opacity={0} depthWrite={false} />
        </mesh>
        <mesh ref={glint}>
          <sphereGeometry args={[r * (quality === 'low' ? 0.22 : 0.28), quality === 'low' ? 8 : 12, quality === 'low' ? 6 : 10]} />
          <meshBasicMaterial color="#fffaf3" transparent opacity={glintOpacity(quality)} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
        </mesh>
        <group ref={spin}>
          <mesh castShadow>
            <sphereGeometry args={[r, glossy ? 32 : 24, glossy ? 24 : 16]} />
            {glossy ? (
              <meshPhysicalMaterial
                map={map}
                roughness={0.36}
                metalness={0.04}
                clearcoat={0.62}
                clearcoatRoughness={0.22}
                emissive={skin.football.base}
                emissiveIntensity={0.03}
              />
            ) : (
              <meshStandardMaterial map={map} roughness={quality === 'low' ? 0.5 : 0.4} metalness={0.03} emissive={skin.football.base} emissiveIntensity={0.03} />
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
