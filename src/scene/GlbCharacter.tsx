import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, BoxGeometry, CanvasTexture, LinearFilter, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, Quaternion, SRGBColorSpace, Vector3, type AnimationAction, type Bone, type Group, type Object3D, type Texture, type WebGLRenderer } from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { DRACO_DECODER_PATH, KTX2_TRANSCODER_PATH } from './decoders';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GameEngine } from '../engine/engine';
import { clearFootContactAnchors, setFootContactAnchors } from '../engine/footContact';
import type { SurfacePattern } from '../game/catalogue';
import type { Skin } from '../game/skins';
import type { Quality } from '../game/storage';
import { computePose, createPose, type Pose } from './pose';
import { inspector } from './inspector';
import { computePlayerMotion, createPlayerMotion } from './motion';
import { createMotionRig } from './motionRig';
import { characterLod } from './qualityTier';
import {
  ANIMATION_STATES, BONE_NAMES, EXTRA_BONE_NAMES, MATERIAL_NAMES, characterModelUrl, LOOPING_STATES, UE_BONE_NAMES, rigKind, selectAnimationState, animationSampleTime, skinMaterialColors, validateModel,
  type AnimationState, type BoneKey,
} from './rig';
import { ueDeltaQuaternion } from './ue-pose';
import { ueMovementQuaternion } from './ue-motion';
import { HairVariants } from './HairVariants';
import { measureKickContactAnchors } from './measureFootContact';
import { kickToeClearance, toeClearanceQuaternion } from './kickClearance';
import { bindSunsetToon, setToonTrim, toToonMaterial, type ToonRole } from './toon';

/** glTF images on this skinned head sample as one averaged colour. A canvas copy of the same pixels does not. */
function photographTexture(source: Texture): CanvasTexture | null {
  const image = source.image as (CanvasImageSource & { width?: number; height?: number }) | undefined;
  if (!image?.width || !image.height) return null;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  try {
    context.drawImage(image, 0, 0);
  } catch {
    return null;
  }
  // The street grade and AgX crush this photograph's shadows to black. Lift them
  // so the cheeks stay skin and the painted eyes stay dark features, not holes.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const px = pixels.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const u = px[i + channel] / 255;
      // A small shadow lift only. A stronger curve pulled the painted eyes into the cheek colour.
      const lifted = Math.min(1, Math.pow(u, 0.85) * 0.92 + 0.05);
      px[i + channel] = Math.round(lifted * 255);
    }
  }
  context.putImageData(pixels, 0, 0);
  const map = new CanvasTexture(canvas);
  map.userData.canvas = canvas;
  map.colorSpace = SRGBColorSpace;
  map.flipY = false;
  map.minFilter = LinearFilter;
  map.magFilter = LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

/** Two eye UV islands. A bind-X split put both irises on one socket. Cluster the UVs instead. */
function eyeUvCentroids(uv: { count: number; getX(index: number): number; getY(index: number): number } | null): Array<{ u: number; v: number }> {
  const count = uv?.count ?? 0;
  if (!uv || count < 2) return [];
  let seedA = 0;
  let seedB = 1;
  let furthest = -1;
  const stride = Math.max(1, Math.floor(count / 64));
  for (let i = 0; i < count; i += stride) {
    for (let j = i + stride; j < count; j += stride) {
      const du = uv.getX(i) - uv.getX(j);
      const dv = uv.getY(i) - uv.getY(j);
      const dist = du * du + dv * dv;
      if (dist > furthest) {
        furthest = dist;
        seedA = i;
        seedB = j;
      }
    }
  }
  const seeds = [
    { u: uv.getX(seedA), v: uv.getY(seedA) },
    { u: uv.getX(seedB), v: uv.getY(seedB) },
  ];
  for (let pass = 0; pass < 4; pass += 1) {
    const acc = [
      { u: 0, v: 0, n: 0 },
      { u: 0, v: 0, n: 0 },
    ];
    for (let i = 0; i < count; i += 1) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      const d0 = (u - seeds[0].u) ** 2 + (v - seeds[0].v) ** 2;
      const d1 = (u - seeds[1].u) ** 2 + (v - seeds[1].v) ** 2;
      const side = d0 <= d1 ? acc[0] : acc[1];
      side.u += u;
      side.v += v;
      side.n += 1;
    }
    for (let s = 0; s < 2; s += 1) {
      if (!acc[s].n) continue;
      seeds[s].u = acc[s].u / acc[s].n;
      seeds[s].v = acc[s].v / acc[s].n;
    }
  }
  return seeds;
}

/** Paint a sclera and iris on each eye island and bring the shell forward of the skin. */
function paintEyeIslands(canvas: HTMLCanvasElement, geometry: Mesh['geometry']) {
  const uv = geometry.getAttribute('uv');
  const context = canvas.getContext('2d');
  if (!uv || !context) return;
  const radius = Math.max(10, canvas.width * 0.022);
  for (const side of eyeUvCentroids(uv)) {
    const x = side.u * canvas.width;
    const y = side.v * canvas.height;
    context.beginPath();
    context.fillStyle = '#f4e7da';
    context.ellipse(x, y, radius * 1.45, radius * 0.92, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#1c100c';
    context.arc(x, y, radius * 0.62, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#efe6dc';
    context.arc(x - radius * 0.16, y - radius * 0.16, radius * 0.12, 0, Math.PI * 2);
    context.fill();
  }
}

/**
 * The eye shell can sit behind the face photograph. Stamp a sclera and iris onto the
 * head image at the socket UVs so the eyes read on the surface that the camera sees.
 */
function paintFaceEyes(canvas: HTMLCanvasElement, geometry: Mesh['geometry']) {
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  const normal = geometry.getAttribute('normal');
  const context = canvas.getContext('2d');
  if (!position || !uv || !normal || !context) return;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < position.count; i += 1) maxY = Math.max(maxY, position.getY(i));
  if (maxY < 0.7) return;
  const bins: Array<Map<string, { u: number; v: number; n: number }>> = [new Map(), new Map()];
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < maxY - 0.16 || y > maxY - 0.08) continue;
    if (normal.getZ(i) < 0.35 || position.getZ(i) < 0.06) continue;
    const side = position.getX(i) < 0 ? 0 : 1;
    const u = uv.getX(i);
    const v = uv.getY(i);
    const key = `${Math.round(u * 50)}:${Math.round(v * 50)}`;
    const bin = bins[side].get(key) ?? { u: 0, v: 0, n: 0 };
    bin.u += u;
    bin.v += v;
    bin.n += 1;
    bins[side].set(key, bin);
  }
  const radius = Math.max(8, canvas.width * 0.011);
  for (const side of bins) {
    let best: { u: number; v: number; n: number } | null = null;
    for (const bin of side.values()) {
      if (!best || bin.n > best.n) best = bin;
    }
    if (!best || best.n < 4) continue;
    const x = (best.u / best.n) * canvas.width;
    const y = (best.v / best.n) * canvas.height;
    context.beginPath();
    context.fillStyle = '#f3e6da';
    context.ellipse(x, y, radius * 1.2, radius * 0.75, 0, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#140e0c';
    context.arc(x, y, radius * 0.58, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.fillStyle = '#efe6dc';
    context.arc(x - radius * 0.18, y - radius * 0.18, radius * 0.14, 0, Math.PI * 2);
    context.fill();
  }
}

function seatEyes(geometry: Mesh['geometry']) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  if (!position || !normal) return;
  for (let i = 0; i < position.count; i += 1) {
    position.setXYZ(
      i,
      position.getX(i) + normal.getX(i) * 0.028,
      position.getY(i) + normal.getY(i) * 0.028,
      position.getZ(i) + normal.getZ(i) * 0.028,
    );
  }
  position.needsUpdate = true;
}

function liftKickToe(
  bones: Partial<Record<BoneKey, Bone>>,
  state: AnimationState | null,
  clipTime: number,
  out: Quaternion,
) {
  if (state !== 'KickLeft' && state !== 'KickRight') return;
  const pitch = kickToeClearance(clipTime);
  if (pitch === 0) return;
  const foot = bones[state === 'KickLeft' ? 'footLeft' : 'footRight'];
  if (!foot) return;
  foot.quaternion.multiply(toeClearanceQuaternion(pitch, out));
}

function toonRole(name: string): ToonRole {
  if (name === MATERIAL_NAMES.skin) return 'skin';
  if (name === MATERIAL_NAMES.shirt) return 'shirt';
  return 'flat';
}

/** Straps in foot-bone space. On this rig local +Y runs toward the toe and local −Z is the instep. */
const LACES: ReadonlyArray<{ position: [number, number, number]; size: [number, number, number] }> = [
  { position: [0, 0.042, -0.055], size: [0.074, 0.012, 0.016] },
  { position: [0, 0.07, -0.06], size: [0.068, 0.012, 0.016] },
  { position: [0, 0.098, -0.06], size: [0.06, 0.012, 0.015] },
  { position: [0, 0.124, -0.052], size: [0.05, 0.012, 0.014] },
  { position: [0, 0.084, -0.068], size: [0.016, 0.11, 0.014] },
];

/** Local +Y runs toward the toe and local +Z is the sole (opposite the instep). */
const SOLE: { position: [number, number, number]; size: [number, number, number] } = {
  position: [0, 0.07, 0.042],
  size: [0.074, 0.16, 0.018],
};
const STUDS: ReadonlyArray<[number, number, number]> = [
  [-0.022, 0.018, 0.056],
  [0.022, 0.018, 0.056],
  [-0.022, 0.07, 0.056],
  [0.022, 0.07, 0.056],
  [-0.022, 0.122, 0.054],
  [0.022, 0.122, 0.054],
];

const NUMBERS = [7, 9, 10, 11, 14, 17, 21, 23] as const;

function shirtNumber(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 33 + id.charCodeAt(i)) >>> 0;
  return NUMBERS[hash % NUMBERS.length];
}

function patternIndex(pattern: SurfacePattern): number {
  switch (pattern) {
    case 'plain': return 0;
    case 'panels': return 1;
    case 'wave': return 2;
    case 'mosaic': return 3;
    case 'stripe': return 4;
    case 'gold': return 5;
    case 'midnight': return 6;
    case 'carnival': return 7;
    default: {
      const neverPattern: never = pattern;
      return neverPattern;
    }
  }
}

/** Subtle weave so kit patterns survive a flat colour tint. */
function tintKit(material: MeshStandardMaterial, pattern: SurfacePattern) {
  const id = patternIndex(pattern);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPattern = { value: id };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPattern;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float weave = 1.0;
        if (uPattern > 0.5 && uPattern < 1.5) weave = mix(0.78, 1.0, step(0.5, fract(vMapUv.x * 5.0)));
        else if (uPattern > 1.5 && uPattern < 2.5) weave = 0.82 + 0.18 * sin(vMapUv.y * 36.0 + vMapUv.x * 4.0);
        else if (uPattern > 2.5 && uPattern < 3.5) weave = mix(0.75, 1.0, step(0.65, fract(sin(dot(floor(vMapUv * 8.0), vec2(12.9898, 78.233))) * 43758.5453)));
        else if (uPattern > 3.5 && uPattern < 4.5) weave = mix(0.8, 1.0, step(0.55, fract(vMapUv.y * 10.0)));
        else if (uPattern > 4.5 && uPattern < 5.5) weave = 0.9 + 0.1 * sin(vMapUv.x * 80.0);
        else if (uPattern > 5.5 && uPattern < 6.5) weave = mix(0.7, 1.0, step(0.5, fract(vMapUv.x * 2.0 + vMapUv.y)));
        else if (uPattern > 6.5) weave = 0.84 + 0.16 * sin((vMapUv.x + vMapUv.y) * 28.0);
        diffuseColor.rgb *= weave;`);
  };
  material.customProgramCacheKey = () => `kit-${id}`;
  material.needsUpdate = true;
}

function applyContractBones(bones: Partial<Record<BoneKey, Bone>>, pose: Pose, hipsRestY: number) {
  const set = (key: BoneKey, x: number, y: number, z: number) => {
    const bone = bones[key];
    if (bone) bone.rotation.set(x, y, z);
  };
  if (bones.root) bones.root.position.y = hipsRestY + pose.bodyY;
  set('root', 0, pose.bodyYaw, 0);
  set('spine', pose.torsoPitch, pose.torsoYaw, pose.torsoRoll);
  set('neck', pose.neckPitch, pose.neckYaw, 0);
  set('head', pose.headPitch, pose.headYaw, 0);
  set('armLeft', pose.armLeftPitch, 0, -pose.armLeft);
  set('armRight', pose.armRightPitch, 0, pose.armRight);
  set('elbowLeft', pose.elbowLeft, 0, 0);
  set('elbowRight', pose.elbowRight, 0, 0);
  const leg = (side: 'left' | 'right', thigh: BoneKey, shin: BoneKey, foot: BoneKey) => {
    const limb = pose.legs[side];
    set(thigh, limb.thigh, limb.twist, limb.abduct);
    set(shin, limb.knee, 0, 0);
    set(foot, limb.foot, limb.ankleYaw, limb.ankleRoll);
  };
  leg('left', 'thighLeft', 'shinLeft', 'footLeft');
  leg('right', 'thighRight', 'shinRight', 'footRight');
}

const ktxRenderer: { gl: WebGLRenderer | null } = { gl: null };

function extendCharacterLoader(loader: { setKTX2Loader: (ktx2: KTX2Loader) => void }) {
  const ktx2 = new KTX2Loader();
  ktx2.setTranscoderPath(KTX2_TRANSCODER_PATH);
  if (ktxRenderer.gl) ktx2.detectSupport(ktxRenderer.gl);
  loader.setKTX2Loader(ktx2);
}

function ShirtNumber({ bone, id }: { bone: Bone; id: string }) {
  const group = useRef<Group>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g) {
      g.clearRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(18, 22, 28, 0.82)';
      g.fillRect(28, 34, 72, 60);
      g.fillStyle = '#f4f1ea';
      g.font = '700 54px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(shirtNumber(id)), 64, 66);
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    return map;
  }, [id]);
  useEffect(() => () => texture.dispose(), [texture]);
  useLayoutEffect(() => {
    const node = group.current;
    if (!node) return;
    bone.add(node);
    return () => { bone.remove(node); };
  }, [bone]);
  return (
    <group ref={group} position={[0, 0.02, 0.16]}>
      <mesh>
        <planeGeometry args={[0.16, 0.16]} />
        <meshBasicMaterial map={texture} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  );
}

interface Props { engine: GameEngine; skin: Skin; onInvalid: () => void; expressive?: boolean; quality?: Quality }

/**
 * Rigged GLB footballer (see docs/CHARACTER_GLB.md). Plays the named clips when present, otherwise drives the
 * contract bones from the shared procedural pose. Reports an invalid model so the primitive fallback is used.
 */
export function GlbCharacter({ engine, skin, onInvalid, expressive = true, quality = 'high' }: Props) {
  const gl = useThree((state) => state.gl);
  ktxRenderer.gl = gl;
  // drei types GLTFLoader from three-stdlib, which does not match three's KTX2Loader.
  const gltf = useGLTF(characterModelUrl(characterLod(quality), skin.playerBody), DRACO_DECODER_PATH, true, extendCharacterLoader as never);
  const { scene, clips, report, bones, materials, hairMeshes, kind, quaternius, pbr, chest } = useMemo(() => {
    const root = cloneSkinned(gltf.scene) as Object3D;
    const boneMap: Partial<Record<BoneKey, Bone>> = {};
    const byName = new Map<string, Bone>();
    const mats: Array<MeshToonMaterial | MeshStandardMaterial | MeshBasicMaterial> = [];
    const boneNames: string[] = [];
    const matNames: string[] = [];
    let textured = false;
    root.traverse((o) => {
      if ((o as Bone).isBone) {
        boneNames.push(o.name);
        byName.set(o.name, o as Bone);
      }
        const mesh = o as Mesh;
      if (mesh.isMesh && mesh.material) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const cloned = list.map((m) => {
          const source = m as MeshStandardMaterial;
          const keepPbr = Boolean(source.normalMap);
          if (keepPbr) textured = true;
          // The compressed and glTF copies of the face both sample as one flat colour on
          // this skinned mesh. A canvas of the same photograph samples the real texels.
          if ((source.userData.headPhoto || source.name === 'Eyes') && source.map) {
            const photo = photographTexture(source.map);
            if (photo) {
              const canvas = photo.userData.canvas as HTMLCanvasElement | undefined;
              if (m.name === 'Eyes' && canvas) {
                paintEyeIslands(canvas, mesh.geometry);
                seatEyes(mesh.geometry);
              }
              if (source.userData.headPhoto && canvas) paintFaceEyes(canvas, mesh.geometry);
              photo.needsUpdate = true;
              // The listing's head image is a finished photograph, and this rig has no
              // face normal. Lighting it as albedo turns the whole head into one dark
              // mass, so the face shows the photograph directly.
              const basic = new MeshBasicMaterial({ map: photo, toneMapped: false });
              if (m.name === 'Eyes') {
                basic.polygonOffset = true;
                basic.polygonOffsetFactor = -2;
                basic.polygonOffsetUnits = -2;
              }
              basic.name = m.name;
              basic.userData.facePhoto = true;
              if (source.userData.headPhoto) basic.userData.headPhoto = true;
              return basic;
            }
          }
          const next = keepPbr ? source.clone() : toToonMaterial(m, m.name === MATERIAL_NAMES.skin);
          next.name = m.name;
          // The head photograph is its own Skin material. The wardrobe tint stays off it.
          if (source.userData.headPhoto) next.userData.headPhoto = true;
          return next;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
        if (cloned.some((m) => m.userData.facePhoto)) mesh.receiveShadow = false;
        cloned.forEach((m) => { matNames.push(m.name); mats.push(m); });
      }
    });
    const resolved = rigKind(boneNames);
    const names: Partial<Record<BoneKey, string>> = resolved === 'ue'
      ? UE_BONE_NAMES
      : { ...BONE_NAMES, ...EXTRA_BONE_NAMES };
    (Object.keys(names) as BoneKey[]).forEach((k) => {
      const boneName = names[k];
      if (!boneName) return;
      const bone = byName.get(boneName);
      if (bone) boneMap[k] = bone;
    });
    const hairMeshes: Object3D[] = [];
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      if (list.some((m) => m.name === MATERIAL_NAMES.hair)) hairMeshes.push(mesh);
    });
    return {
      scene: root,
      clips: gltf.animations,
      bones: boneMap,
      materials: mats,
      hairMeshes,
      kind: resolved,
      quaternius: boneNames.includes('Clavicle_L'),
      pbr: textured,
      chest: byName.get('Spine2'),
      report: validateModel(boneNames, gltf.animations.map((a) => a.name), matNames),
    };
  }, [gltf]);

  const useClips = report.missingClips.length === 0;
  const usable = useClips || report.missingBones.length === 0;

  useLayoutEffect(() => {
    if (!useClips) {
      clearFootContactAnchors();
      return;
    }
    const anchors = measureKickContactAnchors(scene, clips);
    setFootContactAnchors(anchors.left, anchors.right);
    if (import.meta.env.DEV) {
      (window as unknown as { __footContact?: typeof anchors }).__footContact = anchors;
    }
    return () => clearFootContactAnchors();
  }, [scene, clips, useClips]);

  useEffect(() => {
    if (!usable) { console.warn('Character GLB does not match the rig contract; using fallback.', report); onInvalid(); return; }
    if (report.missingBones.length || report.missingMaterials.length) console.warn('Character GLB is missing contract items', report);
    // The Quaternius player ships without clips and is posed procedurally. Only the contract rig is expected to include them.
    else if (kind === 'contract' && report.missingClips.length) console.warn('Character GLB is missing animation clips', report.missingClips);
  }, [usable, report, onInvalid, kind]);

  useEffect(() => {
    const colors = skinMaterialColors(skin);
    for (const m of materials) {
      const name = m.name;
      // Every Skin instance gets the wardrobe colour. The head photograph is already
      // the finished face, so multiplying it by the skin swatch flattens the cheeks.
      if (m.userData.facePhoto) {
        m.color.set('#ffffff');
        continue;
      }
      if (colors[name]) m.color.set(colors[name]);
      if ((m as MeshToonMaterial).isMeshToonMaterial) {
        const toon = m as MeshToonMaterial;
        // Flat kit swaps. Skin keeps its atlas so the eye texels survive a tone change.
        if (name !== MATERIAL_NAMES.skin) toon.map = null;
        bindSunsetToon(toon, toonRole(name), skin.clothing.shirtTrim);
        setToonTrim(toon, skin.clothing.shirtTrim);
        continue;
      }
      const standard = m as MeshStandardMaterial;
      if (name === MATERIAL_NAMES.shirt) tintKit(standard, skin.kitPattern);
    }
  }, [skin, materials]);

  useEffect(() => {
    if (pbr || quality === 'low') return;
    const laceGeos = LACES.map((spec) => new BoxGeometry(spec.size[0], spec.size[1], spec.size[2]));
    const heelGeo = new BoxGeometry(0.078, 0.05, 0.018);
    const soleGeo = new BoxGeometry(SOLE.size[0], SOLE.size[1], SOLE.size[2]);
    const studGeo = new BoxGeometry(0.012, 0.012, 0.014);
    const laceMat = new MeshToonMaterial({ name: 'Boot_Laces', color: skin.boots.lace ?? '#F8F9FB' });
    const trimMat = new MeshToonMaterial({ name: 'Boot_Trim', color: skin.boots.trim ?? skin.boots.main });
    const soleMat = new MeshToonMaterial({ name: 'Boot_Sole', color: '#1A1A1A' });
    const studMat = new MeshToonMaterial({ name: 'Boot_Studs', color: '#C4C8D0' });
    bindSunsetToon(laceMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(trimMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(soleMat, 'flat', skin.clothing.shirtTrim);
    bindSunsetToon(studMat, 'flat', skin.clothing.shirtTrim);
    const added: Mesh[] = [];
    const attach = (bone: Bone | undefined) => {
      if (!bone) return;
      LACES.forEach((spec, i) => {
        const mesh = new Mesh(laceGeos[i], laceMat);
        mesh.position.set(spec.position[0], spec.position[1], spec.position[2]);
        mesh.castShadow = quality === 'high';
        mesh.frustumCulled = false;
        bone.add(mesh);
        added.push(mesh);
      });
      const heel = new Mesh(heelGeo, trimMat);
      heel.position.set(0, 0.02, -0.05);
      heel.frustumCulled = false;
      bone.add(heel);
      added.push(heel);
      const sole = new Mesh(soleGeo, soleMat);
      sole.position.set(SOLE.position[0], SOLE.position[1], SOLE.position[2]);
      sole.frustumCulled = false;
      bone.add(sole);
      added.push(sole);
      for (const stud of STUDS) {
        const mesh = new Mesh(studGeo, studMat);
        mesh.position.set(stud[0], stud[1], stud[2]);
        mesh.frustumCulled = false;
        bone.add(mesh);
        added.push(mesh);
      }
    };
    attach(bones.footLeft);
    attach(bones.footRight);
    const anchors = measureKickContactAnchors(scene, clips);
    setFootContactAnchors(anchors.left, anchors.right);
    if (import.meta.env.DEV) {
      (window as unknown as { __footContact?: typeof anchors }).__footContact = anchors;
    }
    return () => {
      for (const mesh of added) mesh.parent?.remove(mesh);
      laceMat.dispose();
      trimMat.dispose();
      soleMat.dispose();
      studMat.dispose();
      for (const geo of laceGeos) geo.dispose();
      heelGeo.dispose();
      soleGeo.dispose();
      studGeo.dispose();
    };
  }, [scene, clips, bones, skin.boots.lace, skin.boots.trim, skin.boots.main, skin.clothing.shirtTrim, pbr, quality]);

  const mixer = useMemo(() => new AnimationMixer(scene), [scene]);
  const actions = useMemo(() => {
    const map = new Map<AnimationState, AnimationAction>();
    for (const state of ANIMATION_STATES) {
      const clip = clips.find((c) => c.name === state);
      if (!clip) continue;
      const a = mixer.clipAction(clip);
      a.setLoop(LOOPING_STATES.has(state) ? LoopRepeat : LoopOnce, Infinity);
      a.clampWhenFinished = true;
      map.set(state, a);
    }
    return map;
  }, [clips, mixer]);

  const pose = useMemo(() => createPose(), []);
  const motion = useMemo(() => createPlayerMotion(), []);
  const motionRig = useMemo(() => createMotionRig({ root: scene, spine: bones.spine, head: bones.head,
    armLeft: bones.armLeft, armRight: bones.armRight, footLeft: bones.footLeft, footRight: bones.footRight }), [scene, bones]);
  const rest = useMemo(() => {
    const m = new Map<BoneKey, { x: number; y: number; z: number }>();
    (Object.keys(bones) as BoneKey[]).forEach((k) => { const b = bones[k]!; m.set(k, { x: b.rotation.x, y: b.rotation.y, z: b.rotation.z }); });
    return m;
  }, [bones]);
  const restQuat = useMemo(() => {
    const m = new Map<BoneKey, Quaternion>();
    (Object.keys(bones) as BoneKey[]).forEach((k) => { const b = bones[k]; if (b) m.set(k, b.quaternion.clone()); });
    return m;
  }, [bones]);
  const hipsRestY = useMemo(() => bones.root?.position.y ?? 0, [bones]);
  const deltaQ = useMemo(() => new Quaternion(), []);
  const footPos = useMemo(() => new Vector3(), []);
  const current = useMemo(() => ({ state: null as AnimationState | null, token: -1 }), []);

  useEffect(() => () => {
    motionRig.restore();
    mixer.stopAllAction();
    // React StrictMode replays effects on mount. Reset the state cache too,
    // otherwise the next frame thinks the stopped action is still playing.
    current.state = null;
    current.token = -1;
  }, [mixer, current, motionRig]);

  useFrame((_, dt) => {
    motionRig.restore();
    if (useClips) {
      const next = selectAnimationState(engine);
      if (next.state !== current.state || next.token !== current.token) {
        const to = actions.get(next.state);
        const from = current.state ? actions.get(current.state) : undefined;
        if (to) {
          to.reset().play();
          if (from && from !== to) {
            // Snappy into kicks (physics-timed); softer out of kick/miss/celebrate into Idle.
            const fromKick = current.state?.startsWith('Kick');
            const toKick = next.state.startsWith('Kick');
            const fade = toKick ? 0.04 : fromKick || current.state === 'Miss' || current.state === 'Celebrate' ? 0.22 : 0.15;
            from.crossFadeTo(to, fade, false);
          }
        }
        current.state = next.state;
        current.token = next.token;
      }
      // Sample every clip from simulation time, keeping paused frames and different render rates consistent.
      const act = current.state ? actions.get(current.state) : undefined;
      if (act) { act.paused = true; act.time = animationSampleTime(engine, next.state, act.getClip().duration); }
      // Quaternius bones keep UE local axes. Tricks that are not one of the five clips
      // (around the world, header, neck stall, thigh, high flick) reuse the procedural pose
      // so the head — and the skinned hair — still follow the ball.
      if (quaternius) {
        computePose(engine, pose);
        const dancing = engine.celebration != null || engine.trick?.kind === 'groove';
        const trickPose = pose.lockMotion || engine.trick != null || dancing;
        if (trickPose) {
          scene.position.set(0, pose.bodyY, 0);
          if (bones.root) bones.root.position.y = hipsRestY;
          (Object.keys(bones) as BoneKey[]).forEach((k) => {
            const b = bones[k];
            const restQ = restQuat.get(k);
            if (b && restQ) b.quaternion.copy(restQ).multiply(ueDeltaQuaternion(k, pose, deltaQ));
          });
        } else {
          mixer.update(dt);
          scene.position.set(0, 0, 0);
          if (act && (next.state === 'KickLeft' || next.state === 'KickRight')) {
            const kickSide = next.state === 'KickLeft' ? 'left' : 'right';
            const legKeys = kickSide === 'left'
              ? (['thighLeft', 'shinLeft', 'footLeft'] as const)
              : (['thighRight', 'shinRight', 'footRight'] as const);
            for (const key of legKeys) {
              const bone = bones[key];
              const restQ = restQuat.get(key);
              if (bone && restQ) bone.quaternion.copy(restQ).multiply(ueDeltaQuaternion(key, pose, deltaQ));
            }
          }
          if (next.state === 'Idle' || next.state.startsWith('Kick')) {
            for (const key of ['head', 'neck'] as const) {
              const b = bones[key];
              const restQ = restQuat.get(key);
              if (b && restQ) b.quaternion.copy(restQ).multiply(ueDeltaQuaternion(key, pose, deltaQ));
            }
          }
        }
      } else {
        computePose(engine, pose);
        const dancing = engine.celebration != null || engine.trick?.kind === 'groove';
        const trickPose = pose.lockMotion || engine.trick != null || dancing;
        if (trickPose) {
          applyContractBones(bones, pose, hipsRestY);
          scene.position.set(0, 0, 0);
        } else {
          mixer.update(dt);
          if (act) liftKickToe(bones, next.state, act.time, deltaQ);
          if (expressive) motionRig.apply(computePlayerMotion(engine, motion));
        }
      }
      if (inspector.active) {
        const foot = bones[current.state === 'KickLeft' ? 'footLeft' : 'footRight'];
        if (foot) { scene.updateMatrixWorld(true); foot.getWorldPosition(footPos); inspector.foot = [footPos.x, footPos.y, footPos.z]; }
      }
      if (import.meta.env.DEV && inspector.trace) {
        scene.updateMatrixWorld(true);
        const joints: number[] = [];
        for (const k of ['head', 'armLeft', 'armRight', 'footLeft', 'footRight', 'root'] as BoneKey[]) {
          const b = bones[k]; if (b) { b.getWorldPosition(footPos); joints.push(footPos.x, footPos.y, footPos.z); }
        }
        inspector.trace.push({ state: current.state ?? '', clip: next.clipTime ?? null, t: engine.time, joints });
      }
      return;
    }
    if (kind === 'ue') {
      computePose(engine, pose);
      const allowMotion = expressive && !pose.lockMotion;
      if (allowMotion) computePlayerMotion(engine, motion);
      else { motion.rootX = 0; motion.rootY = 0; }
      scene.position.x = allowMotion ? motion.rootX : 0;
      scene.position.y = pose.bodyY + (allowMotion ? motion.rootY : 0);
      (Object.keys(UE_BONE_NAMES) as BoneKey[]).forEach((k) => {
        const b = bones[k];
        const restQ = restQuat.get(k);
        if (b && restQ) b.quaternion.copy(restQ).multiply(allowMotion
          ? ueMovementQuaternion(k, pose, motion, deltaQ) : ueDeltaQuaternion(k, pose, deltaQ));
      });
      if (inspector.active) {
        const kickLeft = engine.lastKick.left >= engine.lastKick.right;
        const foot = bones[kickLeft ? 'footLeft' : 'footRight'];
        if (foot) { scene.updateMatrixWorld(true); foot.getWorldPosition(footPos); inspector.foot = [footPos.x, footPos.y, footPos.z]; }
      }
      if (import.meta.env.DEV && inspector.trace) {
        scene.updateMatrixWorld(true);
        const joints: number[] = [];
        for (const k of ['head', 'armLeft', 'armRight', 'footLeft', 'footRight', 'root'] as BoneKey[]) {
          const b = bones[k]; if (b) { b.getWorldPosition(footPos); joints.push(footPos.x, footPos.y, footPos.z); }
        }
        const selected = selectAnimationState(engine);
        inspector.trace.push({ state: selected.state, clip: selected.clipTime ?? null, t: engine.time, joints });
      }
      return;
    }
    // Fallback for rigs without clips: apply the procedural pose on top of the rest pose.
    computePose(engine, pose);
    const set = (k: BoneKey, x: number, y: number, z: number) => {
      const b = bones[k]; const r = rest.get(k);
      if (b && r) b.rotation.set(r.x + x, r.y + y, r.z + z);
    };
    set('spine', pose.torsoPitch, pose.torsoYaw, pose.torsoRoll);
    set('neck', pose.neckPitch, pose.neckYaw, 0);
    set('head', pose.headPitch, pose.headYaw, 0);
    set('armLeft', pose.armLeftPitch, 0, pose.armLeft);
    set('armRight', pose.armRightPitch, 0, -pose.armRight);
    set('elbowLeft', pose.elbowLeft, 0, 0);
    set('elbowRight', pose.elbowRight, 0, 0);
    set('thighLeft', pose.legs.left.thigh, pose.legs.left.twist, pose.legs.left.abduct);
    set('thighRight', pose.legs.right.thigh, pose.legs.right.twist, pose.legs.right.abduct);
    set('shinLeft', pose.legs.left.knee, 0, 0);
    set('shinRight', pose.legs.right.knee, 0, 0);
    set('footLeft', pose.legs.left.foot, pose.legs.left.ankleYaw, pose.legs.left.ankleRoll);
    set('footRight', pose.legs.right.foot, pose.legs.right.ankleYaw, pose.legs.right.ankleRoll);
    if (expressive && !pose.lockMotion) motionRig.apply(computePlayerMotion(engine, motion), false);
  });

  return (
    <>
      <primitive object={scene} />
      <HairVariants
        head={bones.head}
        style={skin.hairStyle ?? 'short'}
        color={skin.body.hair}
        hairMesh={hairMeshes}
      />
      {pbr && chest && <ShirtNumber bone={chest} id={skin.id} />}
    </>
  );
}
