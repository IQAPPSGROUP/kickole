import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { AnimationMixer, BoxGeometry, CanvasTexture, CircleGeometry, DoubleSide, LinearFilter, LoopOnce, LoopRepeat, Mesh, MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, NoColorSpace, Quaternion, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, type AnimationAction, type Bone, type Group, type Object3D, type SkinnedMesh, type Texture, type WebGLRenderer } from 'three';
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

/** The street key is already hot. A light multiply clips the cheeks to white. */
const FACE_ALBEDO = '#b09080';
const FACE_ROUGHNESS = 0.92;
const FACE_ENV = 0.1;

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
  // Keep the photograph's own range. A small shadow open, then a hard cap under the key.
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
  const px = pixels.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 16) continue;
    for (let channel = 0; channel < 3; channel += 1) {
      const u = px[i + channel] / 255;
      const lifted = Math.min(0.78, Math.pow(u, 0.85) * 0.9 + 0.04);
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

/** Visible eye radius in head-bone space. Covers the painted socket without flooding the cheek. */
const FACE_EYE_RADIUS = 0.012;

function paintEye(canvas: HTMLCanvasElement, sclera: string, irisColour: string) {
  const size = canvas.width;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.fillStyle = sclera;
  context.fillRect(0, 0, size, size);
  const cx = size / 2;
  const cy = size / 2;
  // Dark centre stays small enough that the two pupils do not merge at the play camera.
  const iris = size * 0.24;
  context.fillStyle = irisColour;
  context.beginPath();
  context.arc(cx, cy, iris, 0, Math.PI * 2);
  context.fill();
}

/** Albedo chart: warm sclera, brown iris, black pupil, catchlight. */
function eyeChart(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  paintEye(canvas, '#efe6d8', '#3a2014');
  if (context) {
    const cx = size / 2;
    const cy = size / 2;
    const iris = size * 0.24;
    const gradient = context.createRadialGradient(cx, cy, iris * 0.08, cx, cy, iris);
    gradient.addColorStop(0, '#6a3b24');
    gradient.addColorStop(0.55, '#3a2014');
    gradient.addColorStop(1, '#1a0e09');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(cx, cy, iris, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#070504';
    context.beginPath();
    context.arc(cx, cy, iris * 0.42, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#fffaf4';
    context.beginPath();
    context.arc(cx - iris * 0.28, cy - iris * 0.32, iris * 0.14, 0, Math.PI * 2);
    context.fill();
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;
  return map;
}

/** Emissive is sclera only, so the pupil stays black while the white survives AgX. */
function eyeGlow(): CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  paintEye(canvas, '#ffffff', '#000000');
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

function faceEyeGeometry(): CircleGeometry {
  return new CircleGeometry(FACE_EYE_RADIUS, 24);
}

/** Bind-pose points in the space of the bone that weighs each vertex most. */
function skinnedBoneLocal(mesh: SkinnedMesh, only?: Bone): Array<[number, number, number]> {
  const position = mesh.geometry.attributes.position;
  const skinIndex = mesh.geometry.attributes.skinIndex;
  const skinWeight = mesh.geometry.attributes.skinWeight;
  const out: Array<[number, number, number]> = [];
  if (!position || !skinIndex || !skinWeight || !mesh.skeleton) return out;
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i);
    let bone = 0;
    let weight = -1;
    for (let k = 0; k < 4; k += 1) {
      const w = skinWeight.getComponent(i, k);
      if (w > weight) {
        weight = w;
        bone = skinIndex.getComponent(i, k);
      }
    }
    if (only && mesh.skeleton.bones[bone] !== only) continue;
    const inverse = mesh.skeleton.boneInverses[bone];
    if (!inverse) continue;
    vertex.applyMatrix4(mesh.bindMatrix);
    vertex.applyMatrix4(inverse);
    out.push([vertex.x, vertex.y, vertex.z]);
  }
  return out;
}

/**
 * The authored eye shell is skinned to the head but its UVs span the whole
 * face photograph, so it cannot show an iris. Hide it and parent a lit disc
 * to the head bone, seated just proud of the skin.
 */
function attachFaceEyes(root: Object3D, head: Bone | undefined): void {
  if (!head) return;
  const sockets: Array<{ x: number; y: number; z: number }> = [];
  const hide: Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isMesh || !mesh.material) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!list.some((m) => m.name === 'Eyes')) return;
    hide.push(mesh);
    if (!mesh.isSkinnedMesh || sockets.length > 0) return;
    const local = skinnedBoneLocal(mesh);
    for (const sign of [-1, 1] as const) {
      const side = local.filter((p) => (sign < 0 ? p[0] < 0 : p[0] >= 0));
      if (side.length === 0) continue;
      const zMax = Math.max(...side.map((p) => p[2]));
      const front = side.filter((p) => p[2] > zMax - 0.006);
      const sample = front.length > 0 ? front : side;
      let x = 0;
      let y = 0;
      for (const p of sample) {
        x += p[0];
        y += p[1];
      }
      sockets.push({
        x: x / sample.length,
        y: y / sample.length,
        z: zMax,
      });
    }
  });
  let headSkin: SkinnedMesh | undefined;
  root.traverse((o) => {
    const mesh = o as SkinnedMesh;
    if (!mesh.isSkinnedMesh || !mesh.material || headSkin) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (list.some((m) => m.userData.headPhoto)) headSkin = mesh;
  });
  if (headSkin) {
    const skinPoints = skinnedBoneLocal(headSkin, head);
    const reach = 0.018;
    for (const socket of sockets) {
      let z = socket.z;
      for (const p of skinPoints) {
        const dx = p[0] - socket.x;
        const dy = p[1] - socket.y;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (p[2] > z) z = p[2];
      }
      socket.z = z + 0.009;
    }
  } else {
    for (const socket of sockets) socket.z += 0.008;
  }
  for (const mesh of hide) mesh.visible = false;
  if (sockets.length === 0) return;
  const map = eyeChart();
  const geometry = faceEyeGeometry();
  const material = new MeshStandardMaterial({
    map,
    color: '#ffffff',
    roughness: 0.72,
    metalness: 0,
    envMapIntensity: 0.2,
    side: DoubleSide,
    // A small lift keeps the sclera out of the socket shadow. Stronger than this
    // trips the street bloom and turns the eye into a white plate.
    emissive: '#fff6ea',
    emissiveMap: eyeGlow(),
    emissiveIntensity: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  });
  for (const socket of sockets) {
    const eye = new Mesh(geometry, material);
    eye.name = 'FaceEye';
    eye.position.set(socket.x, socket.y, socket.z);
    eye.scale.set(1, 0.66, 1);
    eye.castShadow = false;
    eye.receiveShadow = false;
    eye.frustumCulled = false;
    eye.renderOrder = 2;
    head.add(eye);
  }
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
        float thread = mix(0.82, 1.0, step(0.5, fract(vViewPosition.y * 90.0)));
        diffuseColor.rgb *= weave * thread;`);
  };
  material.customProgramCacheKey = () => `kit-${id}`;
  material.needsUpdate = true;
}

const KIT_DETAIL = new Set<string>([
  MATERIAL_NAMES.shirt,
  MATERIAL_NAMES.shirtTrim,
  MATERIAL_NAMES.shorts,
  MATERIAL_NAMES.socks,
  MATERIAL_NAMES.boots,
  MATERIAL_NAMES.bootsSole,
  'Boot_Laces',
  'Boot_Trim',
]);

let kitDetailMaps: { normal: CanvasTexture; rough: CanvasTexture } | null = null;

/** Weave normal and roughness for High. Shared, and never applied to the head photograph. */
function kitDetail(): { normal: CanvasTexture; rough: CanvasTexture } {
  if (kitDetailMaps) return kitDetailMaps;
  const size = 1024;
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  roughCanvas.width = roughCanvas.height = size;
  const normalG = normalCanvas.getContext('2d');
  const roughG = roughCanvas.getContext('2d');
  if (normalG && roughG) {
    normalG.fillStyle = 'rgb(128,128,255)';
    normalG.fillRect(0, 0, size, size);
    roughG.fillStyle = 'rgb(168,168,168)';
    roughG.fillRect(0, 0, size, size);
    const step = 8;
    normalG.strokeStyle = 'rgb(118,124,250)';
    roughG.strokeStyle = 'rgb(196,196,196)';
    normalG.lineWidth = 1;
    roughG.lineWidth = 1;
    for (let i = 0; i < size; i += step) {
      normalG.beginPath();
      normalG.moveTo(i, 0);
      normalG.lineTo(i, size);
      normalG.moveTo(0, i);
      normalG.lineTo(size, i);
      normalG.stroke();
      roughG.beginPath();
      roughG.moveTo(i, 0);
      roughG.lineTo(i, size);
      roughG.moveTo(0, i);
      roughG.lineTo(size, i);
      roughG.stroke();
    }
  }
  const pack = (canvas: HTMLCanvasElement) => {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    texture.repeat.set(6, 6);
    return texture;
  };
  kitDetailMaps = { normal: pack(normalCanvas), rough: pack(roughCanvas) };
  return kitDetailMaps;
}

function applyKitDetail(material: MeshStandardMaterial, name: string, quality: Quality) {
  if (!KIT_DETAIL.has(name) || material.userData.facePhoto) return;
  if (quality !== 'high') {
    if (material.userData.kitDetail) {
      material.normalMap = (material.userData.authoredNormal as Texture | null) ?? null;
      material.roughnessMap = (material.userData.authoredRough as Texture | null) ?? null;
      const scale = (material.userData.authoredNormalScale as number) ?? 1;
      material.normalScale = new Vector2(scale, scale);
      material.userData.kitDetail = false;
      material.needsUpdate = true;
    }
    return;
  }
  if (!material.userData.kitDetail) {
    material.userData.authoredNormal = material.normalMap ?? null;
    material.userData.authoredRough = material.roughnessMap ?? null;
    material.userData.authoredNormalScale = material.normalScale?.x ?? 1;
  }
  const maps = kitDetail();
  if (!material.userData.authoredNormal) {
    material.normalMap = maps.normal;
    material.normalScale = new Vector2(0.35, 0.35);
  } else {
    material.normalScale = new Vector2(1.55, 1.55);
  }
  if (!material.userData.authoredRough) material.roughnessMap = maps.rough;
  material.userData.kitDetail = true;
  material.needsUpdate = true;
}

let skinDetailMaps: { normal: CanvasTexture; rough: CanvasTexture } | null = null;

/** Pore normal and roughness for body skin. The head photograph keeps its own flat normal. */
function skinDetail(): { normal: CanvasTexture; rough: CanvasTexture } {
  if (skinDetailMaps) return skinDetailMaps;
  const size = 512;
  const normalCanvas = document.createElement('canvas');
  const roughCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = size;
  roughCanvas.width = roughCanvas.height = size;
  const normalG = normalCanvas.getContext('2d');
  const roughG = roughCanvas.getContext('2d');
  if (normalG && roughG) {
    normalG.fillStyle = 'rgb(128,128,255)';
    normalG.fillRect(0, 0, size, size);
    roughG.fillStyle = 'rgb(158,158,158)';
    roughG.fillRect(0, 0, size, size);
    for (let i = 0; i < 700; i += 1) {
      const x = (i * 47) % size;
      const y = (i * 29) % size;
      const shade = 96 + (i % 5) * 10;
      normalG.fillStyle = `rgb(${shade},${120 + (i % 3) * 8},255)`;
      normalG.fillRect(x, y, 3, 3);
      roughG.fillStyle = `rgb(${120 + (i % 7) * 12},${120 + (i % 7) * 12},${120 + (i % 7) * 12})`;
      roughG.fillRect(x, y, 3, 3);
    }
  }
  const pack = (canvas: HTMLCanvasElement) => {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = NoColorSpace;
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.anisotropy = 8;
    texture.repeat.set(4, 4);
    return texture;
  };
  skinDetailMaps = { normal: pack(normalCanvas), rough: pack(roughCanvas) };
  return skinDetailMaps;
}

function applySkinDetail(material: MeshStandardMaterial, name: string, quality: Quality) {
  if (name !== MATERIAL_NAMES.skin || material.userData.facePhoto) return;
  if (quality !== 'high') {
    if (material.userData.skinDetail) {
      material.normalMap = (material.userData.authoredNormal as Texture | null) ?? null;
      material.roughnessMap = (material.userData.authoredRough as Texture | null) ?? null;
      const scale = (material.userData.authoredNormalScale as number) ?? 1;
      material.normalScale = new Vector2(scale, scale);
      material.userData.skinDetail = false;
      material.needsUpdate = true;
    }
    if (material.userData.skinPores) {
      material.onBeforeCompile = () => {};
      material.customProgramCacheKey = () => 'skin';
      material.userData.skinPores = false;
      material.needsUpdate = true;
    }
    return;
  }
  if (!material.userData.skinDetail) {
    material.userData.authoredNormal = material.normalMap ?? null;
    material.userData.authoredRough = material.roughnessMap ?? null;
    material.userData.authoredNormalScale = material.normalScale?.x ?? 1;
  }
  const maps = skinDetail();
  if (!material.userData.authoredNormal) {
    material.normalMap = maps.normal;
    material.normalScale = new Vector2(0.4, 0.4);
  } else {
    material.normalScale = new Vector2(1.85, 1.85);
  }
  if (!material.userData.authoredRough) material.roughnessMap = maps.rough;
  material.userData.skinDetail = true;
  if (!material.userData.skinPores) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
          float pore = fract(sin(dot(floor(vViewPosition.xy * vec2(70.0, 55.0)), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= mix(0.76, 1.0, step(0.42, pore));`,
      );
    };
    material.customProgramCacheKey = () => 'skin-pores';
    material.userData.skinPores = true;
  }
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
    let litHeadPhoto = false;
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
          if (source.userData.headPhoto && source.map) {
            const photo = photographTexture(source.map);
            if (photo) {
              photo.needsUpdate = true;
              litHeadPhoto = true;
              // Same standard material as the kit: key, fill, shadow and IBL. The
              // photograph is the albedo. A flat colour here would ignore the street lights.
              const lit = new MeshStandardMaterial({
                map: photo,
                normalMap: source.normalMap ?? null,
                color: FACE_ALBEDO,
                roughness: FACE_ROUGHNESS,
                metalness: 0,
                envMapIntensity: FACE_ENV,
              });
              lit.name = m.name;
              lit.userData.facePhoto = true;
              lit.userData.headPhoto = true;
              return lit;
            }
          }
          const next = keepPbr ? source.clone() : toToonMaterial(m, m.name === MATERIAL_NAMES.skin);
          next.name = m.name;
          // The head photograph is its own Skin material. The wardrobe tint stays off it.
          if (source.userData.headPhoto) next.userData.headPhoto = true;
          return next;
        });
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
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
    // Female eyes keep their authored atlas. The male photograph has no sclera,
    // so the head gets a pair of lit eyeballs parented to the head bone.
    if (litHeadPhoto) attachFaceEyes(root, boneMap.head);
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
        m.color.set(FACE_ALBEDO);
        if (m instanceof MeshStandardMaterial) {
          m.roughness = FACE_ROUGHNESS;
          m.envMapIntensity = FACE_ENV;
        }
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
      applyKitDetail(standard, name, quality);
      applySkinDetail(standard, name, quality);
    }
  }, [skin, materials, quality]);

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
