import { useMemo, useEffect, useLayoutEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BufferGeometry, CanvasTexture, Color, DoubleSide, InstancedMesh, MeshStandardMaterial, Object3D, RepeatWrapping, SRGBColorSpace } from 'three';
import type { Quality } from '../game/storage';
import { EnvironmentBackdrop } from './EnvironmentBackdrop';
import { AlleyCourt } from './AlleyCourt';
import { BeachCourt } from './BeachCourt';
import { ENVIRONMENT_THEME } from './environment';
import { Crowd } from './Crowd';
import { profileFor } from './qualityTier';
import { prefersReducedMotion, sceneLifeBudget } from './juice';
import { STREET_APRON_ENV, STREET_APRON_TINT, STREET_CONCRETE_ENV, STREET_CONCRETE_TINT, STREET_COURT_ENV, STREET_COURT_TINT } from './daylight';
import { createPennantGeometry, placeRope } from './pennant';
import { concreteMapSet, courtMapSet, fenceModel, fencePosts, fenceSlots, LAMP_SPOTS, STREET_FILES, streetUrl, wallMapSet, type FenceSlot, type LampSpot } from './streetLayout';
import { useStreetMaps, useStreetNodes, type StreetMaps } from './streetMaterials';

const NAVY = '#1E2A5A';
const TEAL = '#00B8A9';
const LIME = '#FFD93D';
const CORAL = '#FF4F9A';
const WHITE = '#F8F9FB';

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
        <boxGeometry args={[0.55, 0.16, 0.22]} />
        <meshBasicMaterial color="#ffc98a" toneMapped={false} />
      </mesh>
    </group>
  );
}

const FESTA = ['#ff4f9a', '#ffd93d', '#2ee6d6', '#7c6bff', '#ff8a3d', '#ffffff', '#5ee08a'];
const FLAG_X = [-4.15, -3.25, -2.35, -1.45, -0.55, 0.35];

/** Bunting, flags and streamers. Four instanced draws, all outside the play box. */
function CarnivalDressing({ sway }: { sway: boolean }) {
  const buntingRef = useRef<InstancedMesh>(null);
  const ropeRef = useRef<InstancedMesh>(null);
  const wallRef = useRef<InstancedMesh>(null);
  const flagRef = useRef<InstancedMesh>(null);
  const poleRef = useRef<InstancedMesh>(null);
  const streamerRef = useRef<InstancedMesh>(null);
  const buntingGeo = useMemo(() => createPennantGeometry(), []);
  const wallGeo = useMemo(() => createPennantGeometry(), []);
  const flagGeo = useMemo(() => createPennantGeometry(), []);
  useEffect(() => () => {
    buntingGeo.dispose();
    wallGeo.dispose();
    flagGeo.dispose();
  }, [buntingGeo, wallGeo, flagGeo]);
  const dummy = useMemo(() => new Object3D(), []);
  const tint = useMemo(() => new Color(), []);
  const buntingN = 18;
  const wallN = 14;
  const streamerN = 12;
  const paint = (time: number, colors: boolean) => {
    const flutter = (u: number, speed: number) => (sway ? Math.sin(time * speed + u * 7) * 0.07 : 0);
    const bunting = buntingRef.current;
    if (bunting) {
      for (let i = 0; i < buntingN; i++) {
        const u = i / (buntingN - 1);
        dummy.position.set(-3.9 + u * 7.6, 3.55 - Math.sin(u * Math.PI) * 0.38 + flutter(u, 2.1), -3.42);
        dummy.rotation.set(flutter(u, 2.1) * 0.4, 0, flutter(u, 2.1));
        dummy.scale.set(1.15, 1.15, 1);
        dummy.updateMatrix();
        bunting.setMatrixAt(i, dummy.matrix);
        if (colors) bunting.setColorAt(i, tint.set(FESTA[i % FESTA.length] ?? FESTA[0]));
      }
      bunting.instanceMatrix.needsUpdate = true;
      if (colors && bunting.instanceColor) bunting.instanceColor.needsUpdate = true;
      const rope = ropeRef.current;
      if (rope) {
        for (let i = 0; i < buntingN - 1; i++) {
          const u0 = i / (buntingN - 1);
          const u1 = (i + 1) / (buntingN - 1);
          placeRope(
            dummy,
            -3.9 + u0 * 7.6, 3.55 - Math.sin(u0 * Math.PI) * 0.38 + flutter(u0, 2.1), -3.42,
            -3.9 + u1 * 7.6, 3.55 - Math.sin(u1 * Math.PI) * 0.38 + flutter(u1, 2.1), -3.42,
          );
          rope.setMatrixAt(i, dummy.matrix);
        }
        rope.instanceMatrix.needsUpdate = true;
      }
    }
    const wall = wallRef.current;
    if (wall) {
      for (let i = 0; i < wallN; i++) {
        const u = i / (wallN - 1);
        dummy.position.set(-3.6 + u * 6.4, 2.28 - Math.sin(u * Math.PI) * 0.28 + flutter(u, 1.7), -3.46);
        dummy.rotation.set(0, 0, flutter(u, 1.7));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        wall.setMatrixAt(i, dummy.matrix);
        if (colors) wall.setColorAt(i, tint.set(FESTA[(i + 2) % FESTA.length] ?? FESTA[0]));
      }
      wall.instanceMatrix.needsUpdate = true;
      if (colors && wall.instanceColor) wall.instanceColor.needsUpdate = true;
    }
    const poles = poleRef.current;
    const flags = flagRef.current;
    FLAG_X.forEach((x, i) => {
      const u = i / (FLAG_X.length - 1);
      if (poles) {
        dummy.position.set(x, 3.15, -3.58);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        poles.setMatrixAt(i, dummy.matrix);
      }
      if (flags) {
        dummy.position.set(x + 0.02, 3.72 + flutter(u, 2.4), -3.46);
        dummy.rotation.set(0, 0.4, flutter(u, 2.4) * 1.4);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        flags.setMatrixAt(i, dummy.matrix);
        if (colors) flags.setColorAt(i, tint.set(FESTA[i % FESTA.length] ?? FESTA[0]));
      }
    });
    if (poles) poles.instanceMatrix.needsUpdate = true;
    if (flags) {
      flags.instanceMatrix.needsUpdate = true;
      if (colors && flags.instanceColor) flags.instanceColor.needsUpdate = true;
    }
    const streamers = streamerRef.current;
    if (streamers) {
      for (let i = 0; i < streamerN; i++) {
        const u = i / (streamerN - 1);
        dummy.position.set(-4.05 + u * 4.7, 2.95 + flutter(u, 2.8), -3.5);
        dummy.rotation.set(flutter(u, 2.8), 0, flutter(u, 1.9));
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        streamers.setMatrixAt(i, dummy.matrix);
        if (colors) streamers.setColorAt(i, tint.set(FESTA[(i + 3) % FESTA.length] ?? FESTA[0]));
      }
      streamers.instanceMatrix.needsUpdate = true;
      if (colors && streamers.instanceColor) streamers.instanceColor.needsUpdate = true;
    }
  };
  useLayoutEffect(() => { paint(0, true); }, []);
  useFrame((state) => { if (sway) paint(state.clock.elapsedTime, false); });
  return (
    <group>
      <instancedMesh ref={ropeRef} args={[undefined, undefined, buntingN - 1]}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.55} />
      </instancedMesh>
      <instancedMesh ref={buntingRef} args={[undefined, undefined, buntingN]}>
        <primitive object={buntingGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.48} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={wallRef} args={[undefined, undefined, wallN]}>
        <primitive object={wallGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.48} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={poleRef} args={[undefined, undefined, FLAG_X.length]}>
        <cylinderGeometry args={[0.02, 0.028, 1.15, 6]} />
        <meshStandardMaterial color="#fff6ea" roughness={0.4} metalness={0.05} />
      </instancedMesh>
      <instancedMesh ref={flagRef} args={[undefined, undefined, FLAG_X.length]}>
        <primitive object={flagGeo} attach="geometry" />
        <meshStandardMaterial side={DoubleSide} roughness={0.45} metalness={0} />
      </instancedMesh>
      <instancedMesh ref={streamerRef} args={[undefined, undefined, streamerN]}>
        <planeGeometry args={[0.07, 0.78]} />
        <meshStandardMaterial side={DoubleSide} roughness={0.4} metalness={0} />
      </instancedMesh>
    </group>
  );
}

/** Low-poly hillside neighbourhood: original geometry, no downloaded models or textures.
 * Placed behind the back wall so the ball and player remain unobstructed.
 * Static buildings are intentionally unlit to minimise mobile GPU cost. */
function HillsideNeighbourhood() {
  const buildings = useMemo(() => {
    const random = seededRandom(1969);
    const palette = ['#f6d7b0', '#f7b7c4', '#ffe08a', '#b7ebe4', '#f7f1e4', '#f0c48a'];
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

const slotDummy = new Object3D();
const LINE_W = 0.14;

function useLineMaterial() {
  const material = useMemo(() => new MeshStandardMaterial({
    color: '#fffdf8',
    roughness: 0.62,
    metalness: 0,
    emissive: '#000000',
    emissiveIntensity: 0,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -12,
  }), []);
  useEffect(() => () => { material.dispose(); }, [material]);
  return material;
}

/** Painted markings as geometry. A 9 cm texture line disappears in the grazing mip. */
function CourtLines() {
  const material = useLineMaterial();
  const boxZ = (z0: number, z1: number) => ({ z: (z0 + z1) / 2, d: Math.abs(z1 - z0) });
  const near = boxZ(1.8, 2.95);
  const far = boxZ(-2.75, -1.6);
  return (
    <group>
      {[-3.15, 3.15].map((x) => (
        <mesh key={`touch-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, 0.1]} material={material}>
          <planeGeometry args={[LINE_W, 5.7]} />
        </mesh>
      ))}
      {[-2.75, 2.95].map((z) => (
        <mesh key={`goal-${z}`} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, z]} material={material}>
          <planeGeometry args={[6.3, LINE_W]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.05]} material={material}>
        <planeGeometry args={[6.3, 0.12]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0.05]} material={material}>
        <ringGeometry args={[1.01, 1.14, 48]} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.021, 0.05]} material={material}>
        <circleGeometry args={[0.13, 20]} />
      </mesh>
      {[-2.3, 2.3].map((x) => (
        <mesh key={`near-box-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, near.z]} material={material}>
          <planeGeometry args={[0.1, near.d]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 1.8]} material={material}>
        <planeGeometry args={[4.6, 0.1]} />
      </mesh>
      {[-2.3, 2.3].map((x) => (
        <mesh key={`far-box-${x}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.02, far.z]} material={material}>
          <planeGeometry args={[0.1, far.d]} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -1.6]} material={material}>
        <planeGeometry args={[4.6, 0.1]} />
      </mesh>
    </group>
  );
}

function LampGlow({ spot }: { spot: LampSpot }) {
  const headX = spot.x + Math.cos(spot.ry) * 0.72;
  const headZ = spot.z - Math.sin(spot.ry) * 0.72;
  return (
    <mesh position={[headX, 3.28, headZ + 0.16]}>
      <planeGeometry args={[0.52, 0.16]} />
      <meshBasicMaterial color="#ffc98a" toneMapped={false} />
    </mesh>
  );
}

function ConcreteSkin({ maps }: { maps: StreetMaps }) {
  return (
    <meshStandardMaterial
      map={maps.color ?? undefined}
      normalMap={maps.normal ?? undefined}
      roughnessMap={maps.rough ?? undefined}
      color={maps.color ? STREET_CONCRETE_TINT : '#c4b8a6'}
      roughness={0.72}
      metalness={0.04}
      envMapIntensity={STREET_CONCRETE_ENV}
    />
  );
}

function SlottedMesh({ geometry, pivot, scale, slots, color, metalness, roughness }: { geometry: BufferGeometry; pivot: [number, number, number]; scale: [number, number, number]; slots: FenceSlot[]; color: string; metalness: number; roughness: number }) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    slots.forEach((slot, index) => {
      slotDummy.position.set(slot.x + pivot[0], slot.y + pivot[1], slot.z + pivot[2]);
      slotDummy.rotation.set(0, slot.ry, 0);
      slotDummy.scale.set(scale[0], scale[1], scale[2]);
      slotDummy.updateMatrix();
      mesh.setMatrixAt(index, slotDummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [slots, pivot, scale]);
  if (slots.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, slots.length]} frustumCulled={false} castShadow>
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={1.2} />
    </instancedMesh>
  );
}

function StreetCourt({ shadows, quality }: { shadows: boolean; quality: Quality }) {
  const profile = profileFor(quality);
  const courtMaps = courtMapSet(profile.courtMaps);
  const wallMaps = wallMapSet(profile.courtMaps);
  const concreteMaps = concreteMapSet(profile.courtMaps);
  const court = useStreetMaps(courtMaps.color, courtMaps.normal, courtMaps.rough, 1, 1);
  const wall = useStreetMaps(wallMaps.color, wallMaps.normal, wallMaps.rough, 1, 1);
  const concrete = useStreetMaps(concreteMaps.color, concreteMaps.normal, concreteMaps.rough, 2, 2);
  const apron = useStreetMaps(streetUrl(STREET_FILES.streetAsphalt), null, null, 18, 18);
  const skid = useStreetMaps(profile.decals ? streetUrl(STREET_FILES.decalSkid) : null, null, null, 1, 1);
  const stencil = useStreetMaps(profile.decals ? streetUrl(STREET_FILES.decalStencil) : null, null, null, 1, 1);
  const tag = useStreetMaps(profile.decals ? streetUrl(STREET_FILES.decalTag) : null, null, null, 1, 1);
  const fenceNodes = useStreetNodes(fenceModel(profile.fence));
  const lampNodes = useStreetNodes(profile.lamp === 'simple' ? null : streetUrl(STREET_FILES.lamp));
  const panel = fenceNodes.find((node) => node.name === 'Panel');
  const post = fenceNodes.find((node) => node.name === 'Post');
  const slots = useMemo(() => fenceSlots(profile.fence), [profile.fence]);
  const posts = useMemo(() => fencePosts(profile.fence), [profile.fence]);
  const sign = useSignTexture();
  const fence = useFenceTexture();
  const blob = useBlobTexture();
  useEffect(() => () => {
    sign.dispose(); fence.dispose(); blob.dispose();
  }, [sign, fence, blob]);
  return (
    <group>
      <EnvironmentBackdrop quality={quality} fallback={<HillsideNeighbourhood />} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow={shadows}>
        <planeGeometry args={[40.5, 40.5]} />
        <meshStandardMaterial
          map={apron.color ?? undefined}
          color={apron.color ? STREET_APRON_TINT : '#8d7048'}
          roughness={0.9}
          metalness={0.02}
          envMapIntensity={STREET_APRON_ENV}
        />
      </mesh>
      <mesh position={[0, -0.08, 0]} receiveShadow={shadows}>
        <boxGeometry args={[9.45, 0.16, 9.45]} />
        <ConcreteSkin maps={concrete} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]} receiveShadow={shadows}>
        <planeGeometry args={[9, 9]} />
        <meshStandardMaterial
          map={court.color ?? undefined}
          normalMap={court.normal ?? undefined}
          roughnessMap={court.rough ?? undefined}
          color={court.color ? STREET_COURT_TINT : '#6d6a66'}
          roughness={court.rough ? 0.94 : 0.78}
          metalness={0.02}
          envMapIntensity={STREET_COURT_ENV}
        />
      </mesh>
      <CourtLines />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, -3.35]}>
        <planeGeometry args={[9, 0.7]} />
        <meshBasicMaterial map={blob} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      {skid.color && (
        <mesh rotation={[-Math.PI / 2, 0, 0.35]} position={[0.7, 0.02, 0.45]}>
          <planeGeometry args={[1.7, 1.05]} />
          <meshStandardMaterial map={skid.color} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} roughness={0.9} />
        </mesh>
      )}
      {stencil.color && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[-1.35, 0.02, -0.7]}>
          <planeGeometry args={[1.15, 1.15]} />
          <meshStandardMaterial map={stencil.color} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} roughness={0.48} metalness={0.04} />
        </mesh>
      )}
      <mesh position={[0, 1.3, -3.6]} receiveShadow={shadows}>
        <boxGeometry args={[9, 2.6, 0.2]} />
        <meshStandardMaterial
          map={wall.color ?? undefined}
          normalMap={wall.normal ?? undefined}
          roughnessMap={wall.rough ?? undefined}
          color={wall.color ? '#ffffff' : '#8a8178'}
          roughness={wall.rough ? 0.74 : 0.58}
          metalness={0.02}
          envMapIntensity={0.65}
        />
      </mesh>
      <mesh position={[0, 1.5, -4.2]} receiveShadow={shadows}>
        <boxGeometry args={[7.6, 0.16, 0.9]} />
        <ConcreteSkin maps={concrete} />
      </mesh>
      <mesh position={[-1.55, 2.05, -3.48]}>
        <planeGeometry args={[3.2, 0.8]} />
        <meshBasicMaterial map={sign} transparent toneMapped={false} />
      </mesh>
      <Poster x={2.15} y={1.35} color={CORAL} />
      <Poster x={3.15} y={1.5} color={TEAL} w={0.9} h={0.7} />
      {tag.color && [-1, 1].map((side) => (
        <mesh key={side} position={[side * 4.28, 0.5, -0.4]} rotation={[0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
          <planeGeometry args={[0.72, 0.72]} />
          <meshStandardMaterial map={tag.color} transparent roughness={0.68} polygonOffset polygonOffsetFactor={-1} />
        </mesh>
      ))}
      {(profile.fence === 'plane' || !panel) && (
        <mesh position={[0, 3.02, -3.48]}>
          <planeGeometry args={[9, 0.78]} />
          <meshStandardMaterial map={fence} transparent alphaTest={0.3} side={DoubleSide} color="#c5ced4" roughness={0.35} metalness={0.72} />
        </mesh>
      )}
      {panel && <SlottedMesh geometry={panel.geometry} pivot={panel.pivot} scale={panel.scale} slots={slots} color="#e7eef2" metalness={0.72} roughness={0.28} />}
      {post && <SlottedMesh geometry={post.geometry} pivot={post.pivot} scale={post.scale} slots={posts} color="#9aa3a8" metalness={0.82} roughness={0.3} />}
      {!post && posts.map((item, index) => (
        <mesh key={`post-${index}`} position={[item.x, item.y + 0.42, item.z]} castShadow>
          <cylinderGeometry args={[0.028, 0.024, 0.84, 5]} />
          <meshStandardMaterial color="#8e989e" metalness={0.75} roughness={0.38} />
        </mesh>
      ))}
      {[-4.4, 4.4].map((x) => (
        <mesh key={x} position={[x, 0.45, 0]} receiveShadow={shadows}>
          <boxGeometry args={[0.18, 0.9, 9]} />
          <ConcreteSkin maps={concrete} />
        </mesh>
      ))}
      <Crowd count={profile.crowd} lod={profile.crowdLod} idle={profile.crowdIdle} />
      <Bin x={-3.7} z={-3} color={TEAL} />
      <Bin x={-3.15} z={-3.05} color={CORAL} />
      <mesh position={[3.05, 0.32, -2.85]} castShadow>
        <boxGeometry args={[1.15, 0.07, 0.34]} />
        <meshStandardMaterial color="#b9a06a" roughness={0.72} />
      </mesh>
      <mesh position={[3.05, 0.16, -2.85]}>
        <boxGeometry args={[1.05, 0.28, 0.28]} />
        <meshStandardMaterial color="#2c3136" roughness={0.55} metalness={0.35} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[3.05, 0.016, -2.85]}>
        <planeGeometry args={[1.6, 0.8]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
      <CarnivalDressing sway={sceneLifeBudget(quality, prefersReducedMotion()).buntingSway} />
      {profile.lamp === 'simple' && LAMP_SPOTS.map((spot) => (
        <Floodlight key={`flood-${spot.x}`} x={spot.x} z={spot.z} />
      ))}
      {lampNodes.map((node) => (
        LAMP_SPOTS.map((spot) => (
          <group key={`${node.name}-${spot.x}`} position={[spot.x, 0, spot.z]} rotation={[0, spot.ry, 0]}>
            <mesh
              geometry={node.geometry}
              position={node.pivot}
              scale={node.scale}
              castShadow={node.name !== 'Lens'}
            >
              {node.name === 'Lens'
                ? <meshStandardMaterial color="#ffe0b8" emissive="#ffb15e" emissiveIntensity={profile.lamp === 'lit' ? 3.4 : 1.8} roughness={0.22} />
                : <meshStandardMaterial color="#b7c0c4" metalness={0.84} roughness={0.32} envMapIntensity={1.25} />}
            </mesh>
          </group>
        ))
      ))}
      {profile.lamp !== 'simple' && LAMP_SPOTS.map((spot) => (
        <LampGlow key={`glow-${spot.x}`} spot={spot} />
      ))}
      {profile.lamp === 'lit' && LAMP_SPOTS.map((spot) => (
        <pointLight
          key={`lamp-light-${spot.x}`}
          position={[spot.x + Math.cos(spot.ry) * 0.55, 3.3, spot.z + 0.35]}
          color="#ffc48a"
          intensity={7}
          distance={6.5}
          decay={2}
        />
      ))}
    </group>
  );
}

export function Court(props: { shadows: boolean; quality: Quality }) {
  switch (ENVIRONMENT_THEME) {
    case 'alley': return <AlleyCourt {...props} />;
    case 'beach': return <BeachCourt {...props} />;
    case 'street': return <StreetCourt {...props} />;
    default: {
      const neverTheme: never = ENVIRONMENT_THEME;
      return neverTheme;
    }
  }
}
