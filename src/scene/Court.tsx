import { useMemo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, Color, DoubleSide, InstancedMesh, NoColorSpace, Object3D, RepeatWrapping, SRGBColorSpace, Texture, TextureLoader } from 'three';
import type { Quality } from '../game/storage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { BeachCourt } from './BeachCourt';
import { ENVIRONMENT_THEME } from './environment';
import { Crowd } from './Crowd';
import { profileFor } from './qualityTier';
import { prefersReducedMotion, sceneLifeBudget } from './juice';

const NAVY = '#1E2A5A';
const TEAL = '#00B8A9';
const LIME = '#FFD93D';
const CORAL = '#FF4F9A';
const WHITE = '#F8F9FB';
const VIOLET = '#6C5CE7';

// Stable paint wear: reloading or changing quality must not rearrange the court.
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

/** KICKOLÉ sign. The canvas aspect (4:1) matches the 3 x 0.75 m plane so letters are not stretched. */
function useSignTexture() {
  return useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 256;
    const g = c.getContext('2d');
    if (g) {
      g.fillStyle = NAVY; g.fillRect(0, 0, 1024, 256);
      g.strokeStyle = LIME; g.lineWidth = 6; g.strokeRect(12, 12, 1000, 232);
      g.font = 'italic 900 150px "Trebuchet MS", "Segoe UI", sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = WHITE; g.fillText('KICKOLÉ', 512, 106, 930);
      g.font = '700 30px "Trebuchet MS", sans-serif';
      g.fillStyle = CORAL; g.fillText('FUTEBOL DE RUA', 512, 209);
    }
    const t = new CanvasTexture(c);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
}

/** Chain-link fence pattern with transparency. */
function useFenceTexture() {
  return useMemo(() => {
    const t = makeCanvas(128, (g, n) => {
      g.strokeStyle = 'rgba(190,210,215,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      for (let i = -n; i < n * 2; i += 32) { g.moveTo(i, 0); g.lineTo(i + n, n); g.moveTo(i, n); g.lineTo(i + n, 0); }
      g.stroke();
    });
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(16, 3);
    return t;
  }, []);
}

/** Soft radial dark patch used as a fake contact shadow / ambient occlusion decal. */
function useBlobTexture() {
  return useMemo(
    () => makeCanvas(128, (g, n) => {
      const grad = g.createRadialGradient(n / 2, n / 2, 4, n / 2, n / 2, n / 2);
      grad.addColorStop(0, 'rgba(0,0,0,0.55)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, n, n);
    }),
    [],
  );
}

function Bin({ x, z, color }: { x: number; z: number; color: string }) {
  const blob = useBlobTexture();
  return (
    <group position={[x, 0, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}>
        <planeGeometry args={[0.9, 0.9]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <mesh position={[0, 0.3, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.17, 0.6, 14]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <cylinderGeometry args={[0.22, 0.22, 0.04, 14]} />
        <meshStandardMaterial color="#2c3136" roughness={0.62} metalness={0.25} />
      </mesh>
    </group>
  );
}

function Poster({ x, y, color, w = 0.7, h = 0.95 }: { x: number; y: number; color: string; w?: number; h?: number }) {
  return (
    <group position={[x, y, -3.47]}>
      <mesh>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial color={WHITE} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.08, 0.012]}>
        <boxGeometry args={[w * 0.8, h * 0.55, 0.01]} />
        <meshStandardMaterial color={color} roughness={0.72} metalness={0.04} />
      </mesh>
      <mesh position={[0, -h * 0.34, 0.012]}>
        <boxGeometry args={[w * 0.6, 0.06, 0.01]} />
        <meshStandardMaterial color="#2c3136" roughness={0.62} metalness={0.25} />
      </mesh>
    </group>
  );
}

function Floodlight({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 1.8, 0]}>
        <cylinderGeometry args={[0.05, 0.07, 3.6, 8]} />
        <meshStandardMaterial color="#2c3136" roughness={0.62} metalness={0.25} />
      </mesh>
      <mesh position={[0, 3.65, 0]}>
        <boxGeometry args={[0.5, 0.12, 0.2]} />
        <meshStandardMaterial color={WHITE} emissive={WHITE} emissiveIntensity={1.1} roughness={0.4} />
      </mesh>
    </group>
  );
}

const BUNTING_COLORS = [CORAL, LIME, TEAL, VIOLET];

/** Festa-style bunting: one instanced draw call, strung across the back of the court. */
function Bunting({ sway }: { sway: boolean }) {
  const ref = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const N = 22;
  const paint = (time: number) => {
    const m = ref.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const wave = sway ? Math.sin(time * 2.2 + u * 8) * 0.05 : 0;
      dummy.position.set(-3.7 + u * 7.4, 2.62 - Math.sin(u * Math.PI) * 0.22 - 0.09 + wave, -3.18);
      dummy.rotation.set(0, 0, Math.PI + (u - 0.5) * 0.25 + wave);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      if (time === 0) m.setColorAt(i, tint.set(BUNTING_COLORS[i % BUNTING_COLORS.length]));
    }
    m.instanceMatrix.needsUpdate = true;
    if (time === 0 && m.instanceColor) m.instanceColor.needsUpdate = true;
  };
  useLayoutEffect(() => { paint(0); }, []);
  useFrame((state) => { if (sway) paint(state.clock.elapsedTime); });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]}>
      <circleGeometry args={[0.1, 3]} />
      <meshBasicMaterial side={DoubleSide} />
    </instancedMesh>
  );
}

/** Low-poly hillside neighbourhood: original geometry, no downloaded models or textures.
 * Placed behind the back wall so the ball and player remain unobstructed.
 * Static buildings are intentionally unlit to minimise mobile GPU cost. */
function HillsideNeighbourhood() {
  const buildings = useMemo(() => {
    const random = seededRandom(1969);
    const palette = ['#8d6b58', '#6e5348', '#c4b49a', '#5c6a62', '#4a5560', '#2c3338'];
    return Array.from({ length: 22 }, (_, i) => {
      const row = i < 12 ? 0 : 1;
      const index = row === 0 ? i : i - 12;
      const x = (index - (row === 0 ? 5.5 : 4.5)) * (row === 0 ? 0.93 : 1.24);
      const z = row === 0 ? -5.5 - random() * 0.5 : -7.3 - random() * 0.9;
      const width = 0.74 + random() * 0.48;
      const height = (row === 0 ? 2.0 : 3.0) + random() * 2.0;
      const depth = 0.7 + random() * 0.55;
      return { x, z, width, height, depth, color: palette[i % palette.length], roof: i % 3 === 0, balcony: i % 4 === 0 };
    });
  }, []);
  return (
    <group>
      {/* Distant skyline blocks: flat shaded and intentionally low-poly. */}
      {buildings.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]}>
          <mesh position={[0, b.height / 2, 0]}>
            <boxGeometry args={[b.width, b.height, b.depth]} />
            <meshLambertMaterial color={b.color} />
          </mesh>
          <mesh position={[0, b.height + 0.055, 0]}>
            <boxGeometry args={[b.width + 0.13, 0.11, b.depth + 0.13]} />
            <meshLambertMaterial color="#D8C6AA" />
          </mesh>
          {/* Dark windows face the camera. */}
          {[-0.22, 0.22].map((u, k) => (
            <mesh key={k} position={[u * b.width, b.height * 0.68, b.depth / 2 + 0.008]}>
              <planeGeometry args={[0.14, 0.22]} />
              <meshBasicMaterial color="#294854" />
            </mesh>
          ))}
          {b.roof && (
            <mesh position={[b.width * 0.23, b.height + 0.24, 0]}>
              <boxGeometry args={[0.09, 0.37, 0.09]} />
              <meshLambertMaterial color="#56616A" />
            </mesh>
          )}
          {b.balcony && (
            <mesh position={[0, b.height * 0.46, b.depth / 2 + 0.12]}>
              <boxGeometry args={[b.width * 0.72, 0.06, 0.23]} />
              <meshLambertMaterial color="#E3D4BB" />
            </mesh>
          )}
          {/* Rooftop water tanks and solar panels break up the boxy skyline. */}
          {i % 5 === 0 && (
            <group position={[-b.width * 0.2, b.height + 0.3, 0]}>
              <mesh>
                <cylinderGeometry args={[0.17, 0.19, 0.44, 8]} />
                <meshLambertMaterial color="#283C43" />
              </mesh>
              <mesh position={[0, 0.24, 0]}>
                <cylinderGeometry args={[0.19, 0.19, 0.035, 8]} />
                <meshLambertMaterial color="#17262D" />
              </mesh>
            </group>
          )}
          {i % 6 === 2 && (
            <mesh position={[0, b.height + 0.21, 0]} rotation={[-0.35, 0, 0]}>
              <boxGeometry args={[b.width * 0.55, 0.035, 0.37]} />
              <meshLambertMaterial color="#274A61" />
            </mesh>
          )}
          {/* Sunshades and colourful laundry give the houses lived-in detail. */}
          {i % 3 === 1 && (
            <group position={[0, b.height * 0.46 + 0.22, b.depth / 2 + 0.15]}>
              <mesh rotation={[0.2, 0, 0]}>
                <boxGeometry args={[b.width * 0.85, 0.035, 0.36]} />
                <meshLambertMaterial color={i % 2 ? "#E5BD71" : "#D16F56"} />
              </mesh>
              {[-0.22, 0, 0.22].map((u, j) => (
                <mesh key={j} position={[u * b.width, -0.17 - j * 0.02, 0.15]}>
                  <planeGeometry args={[0.15, 0.28 + j * 0.035]} />
                  <meshBasicMaterial color={['#F5E9C9', '#5E9FBC', '#D65E62'][j]} side={DoubleSide} />
                </mesh>
              ))}
            </group>
          )}
        </group>
      ))}
    </group>
  );
}

const STREET = `${import.meta.env.BASE_URL}textures/street/`;

function useFileTexture(url: string | null, color: boolean, repeatX: number, repeatY = repeatX, anisotropy = 4) {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let alive = true;
    const loader = new TextureLoader();
    loader.load(url, (loaded) => {
      if (!alive) { loaded.dispose(); return; }
      loaded.wrapS = loaded.wrapT = RepeatWrapping;
      loaded.repeat.set(repeatX, repeatY);
      loaded.colorSpace = color ? SRGBColorSpace : NoColorSpace;
      loaded.anisotropy = anisotropy;
      setTex(loaded);
    });
    return () => {
      alive = false;
      setTex((current) => { current?.dispose(); return null; });
    };
  }, [url, color, repeatX, repeatY, anisotropy]);
  return tex;
}

/** Seeded pitch scuffs. The 2K court plates are upscales, so the wear is painted here. */
function useWearTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const g = canvas.getContext('2d');
    const rand = seededRandom(20261020);
    if (g) {
      g.clearRect(0, 0, 1024, 1024);
      for (let i = 0; i < 36; i++) {
        g.save();
        g.translate(512 + (rand() - 0.5) * 780, 512 + (rand() - 0.5) * 780);
        g.rotate(rand() * Math.PI);
        g.fillStyle = `rgba(16,10,8,${0.42 + rand() * 0.4})`;
        g.beginPath();
        g.ellipse(0, 0, 40 + rand() * 170, 10 + rand() * 34, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
      for (let i = 0; i < 8; i++) {
        g.save();
        g.translate(280 + rand() * 460, 300 + rand() * 420);
        g.rotate(-0.4 + rand() * 0.8);
        g.fillStyle = 'rgba(10,8,6,0.72)';
        g.fillRect(-90, -7, 180, 14);
        g.restore();
      }
      for (let i = 0; i < 10; i++) {
        g.fillStyle = `rgba(234,244,74,${0.28 + rand() * 0.35})`;
        g.fillRect(300 + rand() * 420, 320 + rand() * 380, 8 + rand() * 28, 3 + rand() * 6);
      }
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }, []);
}

/** Seats on the camera side of the back fence. A stand behind the hillside mesh never enters this portrait frame. */
function BackStand() {
  const seats = [-2.8, -1.4, 0, 1.4, 2.8];
  return (
    <group position={[0, 3.42, -3.15]}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[7.2, 0.22, 0.38]} />
        <meshStandardMaterial color="#3e3834" roughness={0.9} metalness={0.02} />
      </mesh>
      {seats.map((x) => (
        <mesh key={x} position={[x, 0.28, 0]} castShadow>
          <boxGeometry args={[0.34, 0.32, 0.28]} />
          <meshStandardMaterial color={Math.abs(x) < 0.1 || Math.abs(x) > 2.5 ? '#6e4b3a' : '#2f3d4a'} roughness={0.78} />
        </mesh>
      ))}
    </group>
  );
}

function StreetCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const profile = profileFor(quality);
  const high = quality === 'high';
  const [detail, setDetail] = useState(false);
  useEffect(() => {
    if (quality === 'low') return;
    const id = window.setTimeout(() => setDetail(true), 500);
    return () => window.clearTimeout(id);
  }, [quality]);
  // High loads lanczos 2K plates derived from the 1K set. There is no separate 2K photoshoot.
  const plate = profile.texture === 2048 ? '2k/' : '';
  const aniso = profile.anisotropy;
  const asphalt = useFileTexture(`${STREET}${plate}asphalt_diff.jpg`, true, 4, 4, aniso);
  const asphaltN = useFileTexture(detail ? `${STREET}${plate}asphalt_nor.jpg` : null, false, 4, 4, aniso);
  const asphaltR = useFileTexture(detail ? `${STREET}${plate}asphalt_rough.jpg` : null, false, 4, 4, aniso);
  const wall = useFileTexture(`${STREET}${plate}wall_graffiti.jpg`, true, 1, 1, aniso);
  const wallN = useFileTexture(detail ? `${STREET}${plate}concrete_nor.jpg` : null, false, 1, 1, aniso);
  const wallR = useFileTexture(detail ? `${STREET}${plate}concrete_rough.jpg` : null, false, 1, 1, aniso);
  const sign = useSignTexture();
  const fence = useFenceTexture();
  const blob = useBlobTexture();
  const wear = useWearTexture();
  useEffect(() => () => {
    sign.dispose(); fence.dispose(); blob.dispose(); wear.dispose();
  }, [sign, fence, blob, wear]);
  return (
    <group>
      <EnvironmentBackdrop quality={quality} fallback={<HillsideNeighbourhood />} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial map={asphalt ?? undefined} normalMap={asphaltN ?? undefined} roughnessMap={asphaltR ?? undefined} color={asphalt ? '#ffffff' : '#6d6a66'} roughness={0.92} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <ringGeometry args={[1.17, 1.24, 64]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.003, 0]}>
        <circleGeometry args={[0.06, 16]} />
        <meshBasicMaterial color={WHITE} />
      </mesh>
      {[-3.4, 3.4].map((x) => (
        <mesh key={x} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.003, 0]}>
          <planeGeometry args={[0.06, 9]} />
          <meshBasicMaterial color={WHITE} />
        </mesh>
      ))}
      {/* Fake ambient occlusion where the walls meet the floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, -3.3]}>
        <planeGeometry args={[9, 0.8]} />
        <meshBasicMaterial map={blob} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, 1.3, -3.6]} receiveShadow={shadows}>
        <boxGeometry args={[9, 2.6, 0.2]} />
        <meshStandardMaterial map={wall ?? undefined} normalMap={wallN ?? undefined} roughnessMap={wallR ?? undefined} color={wall ? '#ffffff' : '#8a8178'} roughness={0.86} metalness={0} />
      </mesh>
      <mesh position={[-1.6, 2.02, -3.48]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <Poster x={1.9} y={1.4} color={CORAL} />
      <Poster x={3.1} y={1.45} color={TEAL} w={0.9} h={0.7} />
      {/* Chain-link fence along the top of the wall */}
      <mesh position={[0, 2.9, -3.4]}>
        <planeGeometry args={[9, 0.7]} />
        <meshStandardMaterial map={fence} transparent alphaTest={0.3} side={DoubleSide} color="#c5ced4" roughness={0.35} metalness={0.72} />
      </mesh>
      {[-4, -2, 0, 2, 4].map((x) => (
        <mesh key={x} position={[x, 2.9, -3.4]}>
          <boxGeometry args={[0.06, 0.8, 0.06]} />
          <meshStandardMaterial color="#2c3136" roughness={0.62} metalness={0.25} />
        </mesh>
      ))}
      {/* Low side walls */}
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]}>
          <boxGeometry args={[0.2, 0.9, 9]} />
          <meshStandardMaterial color="#3e4650" roughness={0.88} metalness={0.05} />
        </mesh>
      ))}
      {high && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0.15]}>
          <planeGeometry args={[8.2, 8.2]} />
          <meshBasicMaterial map={wear} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      )}
      <Crowd count={profile.crowd} />
      {high && <BackStand />}
      {/* Painted court corners; simple geometry adds no texture downloads. */}
      {[-2.6, 2.6].map((x) => (
        <mesh key={`paint-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.004, 1.2]}>
          <planeGeometry args={[0.09, 3.4]} />
          <meshBasicMaterial color={LIME} />
        </mesh>
      ))}
      {/* Props */}
      <Bin x={-3.7} z={-3} color={TEAL} />
      <Bin x={-3.1} z={-3.1} color={CORAL} />
      <mesh position={[2.9, 0.3, -2.9]}>
        <boxGeometry args={[1.2, 0.08, 0.35]} />
        <meshStandardMaterial color="#b9a06a" roughness={0.72} />
      </mesh>
      <mesh position={[2.9, 0.15, -2.9]}>
        <boxGeometry args={[1.1, 0.3, 0.3]} />
        <meshStandardMaterial color="#2c3136" roughness={0.62} metalness={0.25} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[2.9, 0.005, -2.9]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <Bunting sway={sceneLifeBudget(quality, prefersReducedMotion()).buntingSway} />
      <Floodlight x={-3.8} z={-3.2} />
      <Floodlight x={3.8} z={-3.2} />
    </group>
  );
}

export function Court(props: { shadows: boolean; quality: Quality }) {
  return ENVIRONMENT_THEME === 'beach' ? <BeachCourt {...props} /> : <StreetCourt {...props} />;
}
