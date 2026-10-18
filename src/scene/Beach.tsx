import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, type Group, type Mesh } from 'three';
import { beachBallPose, birdPose } from '../game/set-dressing';
import type { Quality } from '../game/storage';
import { ART, useArtTexture } from './art';
import { fx } from './fx';
import { Spectators } from './Spectators';

function seededRandom(seed: number) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function makeCanvas(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  if (g) draw(g, size);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function useSandTexture() {
  return useMemo(() => {
    const t = makeCanvas(512, (g, n) => {
      const random = seededRandom(17);
      const wash = g.createLinearGradient(0, 0, 0, n);
      wash.addColorStop(0, '#d7b56a');
      wash.addColorStop(0.45, '#e8c98a');
      wash.addColorStop(1, '#f3ddb0');
      g.fillStyle = wash;
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 28; i++) {
        g.fillStyle = random() > 0.5 ? 'rgba(255,236,190,0.16)' : 'rgba(150,96,40,0.08)';
        g.beginPath();
        g.ellipse(random() * n, random() * n, 18 + random() * 40, 8 + random() * 16, random() * Math.PI, 0, Math.PI * 2);
        g.fill();
      }
      for (let i = 0; i < 5000; i++) {
        g.fillStyle = random() > 0.6 ? 'rgba(255,248,220,0.28)' : 'rgba(110,70,28,0.16)';
        g.fillRect(random() * n, random() * n, 1 + random() * 2, 1 + random() * 2);
      }
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(4, 4);
    return t;
  }, []);
}

function useSkyTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 512;
    const g = c.getContext('2d');
    if (g) {
      const wash = g.createLinearGradient(0, 0, 0, 512);
      wash.addColorStop(0, '#3aa0dc');
      wash.addColorStop(0.42, '#8fd4f2');
      wash.addColorStop(0.72, '#f6e2b4');
      wash.addColorStop(1, '#1a8fb0');
      g.fillStyle = wash;
      g.fillRect(0, 0, 16, 512);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, []);
}

function useWaterTexture() {
  return useMemo(() => {
    const t = makeCanvas(256, (g, n) => {
      const gradient = g.createLinearGradient(0, 0, 0, n);
      gradient.addColorStop(0, '#3ec0d8');
      gradient.addColorStop(0.45, '#178fb8');
      gradient.addColorStop(1, '#0b5678');
      g.fillStyle = gradient;
      g.fillRect(0, 0, n, n);
      g.strokeStyle = 'rgba(255,255,255,0.35)';
      g.lineWidth = 3;
      for (let y = 30; y < n; y += 28) {
        g.beginPath();
        for (let x = 0; x <= n; x += 8) {
          const wave = y + Math.sin(x / 18) * 4;
          if (x === 0) g.moveTo(x, wave); else g.lineTo(x, wave);
        }
        g.stroke();
      }
    });
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
    t.repeat.set(6, 2);
    return t;
  }, []);
}

function Palm({ x, z, lean = 0.12, scale = 1, leaves = 7, frond }: { x: number; z: number; lean?: number; scale?: number; leaves?: number; frond: CanvasTexture | null }) {
  const crown = Array.from({ length: leaves }, (_, i) => (i / leaves) * Math.PI * 2);
  return (
    <group position={[x, 0, z]} rotation={[lean, 0, lean * 0.4]} scale={scale}>
      <mesh position={[0.05, 1.35, 0]} rotation={[0, 0, 0.06]} castShadow>
        <cylinderGeometry args={[0.07, 0.13, 2.7, 8]} />
        <meshStandardMaterial color="#6b4228" roughness={0.86} />
      </mesh>
      {crown.map((angle) => (
        <mesh key={angle} position={[Math.sin(angle) * 0.15, 2.72, Math.cos(angle) * 0.08]} rotation={[0.95, angle, 0]}>
          <planeGeometry args={[0.7, 1.35]} />
          <meshStandardMaterial map={frond ?? undefined} color={frond ? '#ffffff' : '#2f9a4a'} transparent alphaTest={0.35} side={DoubleSide} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

function Umbrella({ x, z, cloth }: { x: number; z: number; cloth: CanvasTexture | null }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.03, 0.035, 1.9, 8]} />
        <meshStandardMaterial color="#f7f5ed" />
      </mesh>
      <mesh position={[0, 1.82, 0]} castShadow>
        <coneGeometry args={[0.95, 0.38, 16]} />
        <meshStandardMaterial map={cloth ?? undefined} color={cloth ? '#ffffff' : '#1FA85A'} roughness={0.62} />
      </mesh>
    </group>
  );
}

/** Green cloth with a yellow diamond: beach colours, not a detailed national emblem. */
function Pennant({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.15, 0]}>
        <cylinderGeometry args={[0.025, 0.03, 2.3, 5]} />
        <meshStandardMaterial color="#f4efe4" />
      </mesh>
      <mesh position={[0.42, 2.05, 0]}>
        <boxGeometry args={[0.78, 0.46, 0.02]} />
        <meshStandardMaterial color="#1FA85A" />
      </mesh>
      <mesh position={[0.42, 2.05, 0.02]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.24, 0.24, 0.02]} />
        <meshStandardMaterial color="#F5C94D" />
      </mesh>
    </group>
  );
}

function Barraca({ x, z, cloth }: { x: number; z: number; cloth: CanvasTexture | null }) {
  return (
    <group position={[x, 0, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 1.1, 0.85]} />
        <meshStandardMaterial color="#f3efe4" roughness={0.88} />
      </mesh>
      <mesh position={[0, 1.22, 0.2]} rotation={[0.4, 0, 0]} castShadow>
        <boxGeometry args={[1.85, 0.08, 1.25]} />
        <meshStandardMaterial map={cloth ?? undefined} color={cloth ? '#ffffff' : '#F5C94D'} roughness={0.7} />
      </mesh>
    </group>
  );
}

function Waves() {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const group = ref.current;
    if (!group) return;
    const t = clock.elapsedTime;
    group.children.forEach((child, i) => {
      child.position.z = -4.15 - i * 0.62 + Math.sin(t * 0.9 + i * 1.3) * 0.15;
    });
  });
  return (
    <group ref={ref}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, -4.2 - i * 0.6]}>
          <planeGeometry args={[18, 0.07]} />
          <meshBasicMaterial color={i % 2 ? '#f7f5ed' : '#d8f7ff'} transparent opacity={0.75} />
        </mesh>
      ))}
    </group>
  );
}

function Seagull({ art }: { art: CanvasTexture | null }) {
  const group = useRef<Group>(null);
  useFrame(({ clock, camera }) => {
    const pose = birdPose(clock.elapsedTime);
    const bird = group.current;
    if (!bird) return;
    bird.position.set(pose.x, pose.y, pose.z);
    bird.lookAt(camera.position);
    const flap = 1 + Math.max(0, pose.flap) * 0.06;
    bird.scale.set(flap, 1.08 - (flap - 1), 1);
  });
  return (
    <group ref={group}>
      <mesh>
        <planeGeometry args={[1.7, 1.15]} />
        <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#f7f5ed'} transparent alphaTest={0.25} side={DoubleSide} roughness={0.8} fog={false} />
      </mesh>
    </group>
  );
}

/** Decorative ball only. It never joins the physics ball. */
function BeachBall({ quality, art }: { quality: Quality; art: CanvasTexture | null }) {
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const shadow = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    const pose = beachBallPose(clock.elapsedTime);
    fx.propTime = clock.elapsedTime;
    const popped = fx.beachPop === pose.loop;
    if (group.current) group.current.position.set(pose.x, popped ? 0.06 : pose.y, pose.z);
    if (spin.current) {
      spin.current.rotation.z = pose.spin;
      spin.current.scale.set(popped ? 1.35 : 1, popped ? 0.12 : 1, popped ? 1.35 : 1);
    }
    if (shadow.current) {
      shadow.current.position.set(pose.x, 0.02, pose.z);
      const lift = Math.min(1, pose.y);
      shadow.current.scale.setScalar(popped ? 1.2 : Math.max(0.45, 1.05 - lift * 0.35));
    }
  });
  return (
    <group>
      <mesh ref={shadow} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 14]} />
        <meshBasicMaterial color="#6a4a28" transparent opacity={0.22} depthWrite={false} />
      </mesh>
      <group ref={group}>
        <group ref={spin}>
          <mesh>
            <sphereGeometry args={[0.32, quality === 'low' ? 16 : 28, quality === 'low' ? 12 : 20]} />
            <meshStandardMaterial map={art ?? undefined} color={art ? '#ffffff' : '#e23d3d'} roughness={0.42} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Rain({ quality }: { quality: Quality }) {
  const drops = useRef<Group>(null);
  const count = quality === 'low' ? 6 : 14;
  useFrame(({ clock }) => {
    const group = drops.current;
    if (!group) return;
    group.visible = fx.shower > 0.04;
    const t = clock.elapsedTime;
    group.children.forEach((child, i) => {
      const fall = (t * 1.8 + i * 0.37) % 1;
      child.position.set(-3.2 + (i % 7) * 1.05, 4.2 - fall * 4, -1.2 - (i % 3) * 0.8);
    });
  });
  return (
    <group ref={drops} visible={false}>
      {Array.from({ length: count }, (_, i) => (
        <mesh key={i}>
          <boxGeometry args={[0.015, 0.28, 0.015]} />
          <meshBasicMaterial color="#d5f4ff" transparent opacity={0.45} />
        </mesh>
      ))}
    </group>
  );
}

/** Open sand pitch with the sea behind the player. Props stay outside the kick circle. */
export function Beach({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const sand = useSandTexture();
  const water = useWaterTexture();
  const sky = useSkyTexture();
  const frond = useArtTexture(ART.frond, true);
  const awning = useArtTexture(ART.awning, false);
  const gull = useArtTexture(ART.seagull, true);
  const beachBallArt = useArtTexture(ART.ball, false);
  const sea = useRef<Mesh>(null);
  const sandMat = useRef<MeshStandardMaterial>(null);
  const skyDim = useRef<Mesh>(null);
  const leaves = quality === 'low' ? 5 : 7;
  useEffect(() => () => { sand.dispose(); water.dispose(); sky.dispose(); }, [sand, water, sky]);
  useFrame(({ clock }) => {
    const material = sea.current?.material;
    if (quality !== 'low' && material instanceof MeshStandardMaterial && material.map) material.map.offset.x = clock.elapsedTime * 0.04;
    const wet = fx.shower;
    if (sandMat.current) sandMat.current.color.setRGB(0.953 - wet * 0.42, 0.843 - wet * 0.38, 0.643 - wet * 0.25);
    const dim = skyDim.current;
    if (dim) {
      dim.visible = wet > 0.02;
      const mat = dim.material;
      if (mat instanceof MeshStandardMaterial) mat.opacity = wet * 0.55;
    }
  });
  return (
    <group>
      <mesh position={[0, 5.2, -14.2]}>
        <planeGeometry args={[42, 16]} />
        <meshBasicMaterial map={sky} />
      </mesh>
      <mesh ref={skyDim} position={[0, 5.15, -13.5]} visible={false}>
        <planeGeometry args={[42, 16]} />
        <meshStandardMaterial color="#1c3348" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh position={[-6.6, 1.4, -7.8]} scale={[2.2, 1.35, 1.4]}>
        <sphereGeometry args={[1.05, 14, 10]} />
        <meshStandardMaterial color="#2f6a45" roughness={1} />
      </mesh>
      <mesh position={[-1.15, 1.45, -8.2]} scale={[1.7, 1.55, 1.3]}>
        <sphereGeometry args={[1.05, 14, 10]} />
        <meshStandardMaterial color="#24563a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0.4]} receiveShadow={shadows}>
        <planeGeometry args={[22, 16]} />
        <meshStandardMaterial ref={sandMat} map={sand} color="#f3d7a4" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, -3.5]} receiveShadow={shadows}>
        <planeGeometry args={[22, 2.4]} />
        <meshStandardMaterial color="#b99462" roughness={0.55} metalness={0.04} />
      </mesh>
      <mesh ref={sea} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, -9.2]}>
        <planeGeometry args={[36, 14]} />
        <meshStandardMaterial map={water} color="#ffffff" roughness={quality === 'high' ? 0.12 : 0.28} metalness={quality === 'low' ? 0.08 : 0.28} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -4.15]}>
        <planeGeometry args={[20, 0.55]} />
        <meshBasicMaterial color="#f7f5ed" transparent opacity={0.55} />
      </mesh>
      <group position={[-4.6, 1.75, -6.1]}>
        <mesh>
          <sphereGeometry args={[0.62, quality === 'low' ? 10 : 20, quality === 'low' ? 10 : 16]} />
          <meshBasicMaterial color="#ffe56a" fog={false} />
        </mesh>
        {quality !== 'low' && (
          <mesh>
            <sphereGeometry args={[1.25, 16, 12]} />
            <meshBasicMaterial color="#ffe9a8" transparent opacity={0.32} depthWrite={false} fog={false} />
          </mesh>
        )}
      </group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
        <ringGeometry args={[1.15, 1.22, 48]} />
        <meshBasicMaterial color="#fff6df" />
      </mesh>
      <Waves />
      <Seagull art={gull} />
      <BeachBall quality={quality} art={beachBallArt} />
      <Rain quality={quality} />
      <Spectators scene="beach" />
      <Palm x={-3.6} z={-2.2} lean={0.08} leaves={leaves} frond={frond} />
      <Palm x={3.5} z={-1.6} lean={-0.1} scale={0.92} leaves={leaves} frond={frond} />
      <Palm x={-4.6} z={1.2} lean={0.16} scale={0.8} leaves={leaves} frond={frond} />
      <Umbrella x={2.7} z={-2.7} cloth={awning} />
      <Barraca x={-2.9} z={-3.05} cloth={awning} />
      <Pennant x={1.7} z={-2.55} />
      <mesh position={[-5.2, -0.15, 1.4]} scale={[2.4, 0.45, 1.6]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#efd3a2" roughness={1} />
      </mesh>
      <mesh position={[5.4, -0.2, -0.4]} scale={[2.2, 0.4, 1.8]}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial color="#e8c48a" roughness={1} />
      </mesh>
    </group>
  );
}
