import { Color, type BufferAttribute, type InterleavedBufferAttribute, type Material, type Mesh } from 'three';
import type { Skin } from '../game/skins';
import { MATERIAL_NAMES } from './rig';

type ColouredMaterial = Material & {
  color?: Color;
  map?: unknown;
  needsUpdate: boolean;
};

type WeightedMesh = Mesh & {
  isSkinnedMesh?: boolean;
  skeleton?: { bones: Array<{ name: string }> };
};

type FaceUniforms = {
  uFaceHair: { value: Color };
  uFaceSkin: { value: Color };
  uHeadMin: { value: number };
  uHeadSpan: { value: number };
};

/**
 * The visible scalp is the hair baked into the head photograph. The Hair mesh
 * sits on the back of the head, so clearing its map does not change the
 * wardrobe view. The crown cut is the head mesh's own bind-pose height, above
 * the nose and mouth. That cap is drawn as the hair swatch. The face below
 * keeps the photograph and takes only a light step toward the skin swatch.
 */
export const FACE_HAIR = {
  crownLo: 0.68,
  crownHi: 0.78,
  skinMix: 0.16,
} as const;

/**
 * The head skin follows the Head bone. On the male that mesh is also flagged
 * headPhoto. On the female it is a separate Skin mesh with no flag. Either way
 * it is the photograph: a full swatch multiply muddies the eyes and mouth.
 */
export function meshIsPhotographedFace(mesh: Mesh): boolean {
  const skinned = mesh as WeightedMesh;
  const index = mesh.geometry?.attributes.skinIndex as BufferAttribute | InterleavedBufferAttribute | undefined;
  const weight = mesh.geometry?.attributes.skinWeight as BufferAttribute | InterleavedBufferAttribute | undefined;
  if (!skinned.isSkinnedMesh || !skinned.skeleton || !index || !weight) return false;
  const bones = skinned.skeleton.bones;
  let head = 0;
  let other = 0;
  const step = Math.max(1, Math.floor(index.count / 80));
  for (let i = 0; i < index.count; i += step) {
    for (let influence = 0; influence < 4; influence += 1) {
      const amount = weight.getComponent(i, influence);
      if (amount < 0.25) continue;
      const bone = bones[index.getComponent(i, influence)];
      if (bone?.name === 'Head') head += amount;
      else other += amount;
    }
  }
  return head > other && head > 0;
}

/** Bind-pose height of a head mesh. The shader reads the same position attribute. */
export function measureHeadSpan(mesh: Mesh): { min: number; span: number } {
  const position = mesh.geometry?.attributes.position as BufferAttribute | InterleavedBufferAttribute | undefined;
  if (!position || position.count === 0) return { min: 0, span: 1 };
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const y = position.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  return { min, span: Math.max(0.0001, max - min) };
}

function isPhotographedFace(material: Material): boolean {
  return material.userData.headPhoto === true || material.userData.facePhoto === true;
}

function faceUniforms(material: Material): FaceUniforms {
  const existing = material.userData.faceUniforms as FaceUniforms | undefined;
  if (existing) return existing;
  const created: FaceUniforms = {
    uFaceHair: { value: new Color('#ffffff') },
    uFaceSkin: { value: new Color('#ffffff') },
    uHeadMin: { value: 0 },
    uHeadSpan: { value: 1 },
  };
  material.userData.faceUniforms = created;
  return created;
}

const FACE_SHADER = `
float faceT = clamp((vHeadY - uHeadMin) / max(uHeadSpan, 0.0001), 0.0, 1.0);
float faceCrown = smoothstep(${FACE_HAIR.crownLo}, ${FACE_HAIR.crownHi}, faceT);
vec3 faceShift = mix(sampledDiffuseColor.rgb, uFaceSkin, ${FACE_HAIR.skinMix});
diffuseColor.rgb = mix(faceShift, uFaceHair, faceCrown);
`;

function bindPhotographedFace(material: ColouredMaterial, hair: string, skin: string): void {
  const uniforms = faceUniforms(material);
  uniforms.uFaceHair.value.set(hair);
  uniforms.uFaceSkin.value.set(skin);
  uniforms.uHeadMin.value = Number(material.userData.headMin ?? 0);
  uniforms.uHeadSpan.value = Number(material.userData.headSpan ?? 1);
  material.userData.faceHairBound = true;
  if (material.color) material.color.set('#ffffff');
  if (material.userData.faceShader === true) return;
  material.userData.faceShader = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFaceHair = uniforms.uFaceHair;
    shader.uniforms.uFaceSkin = uniforms.uFaceSkin;
    shader.uniforms.uHeadMin = uniforms.uHeadMin;
    shader.uniforms.uHeadSpan = uniforms.uHeadSpan;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vHeadY;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvHeadY = position.y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uFaceHair;
uniform vec3 uFaceSkin;
uniform float uHeadMin;
uniform float uHeadSpan;
varying float vHeadY;
`)
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_MAP
${FACE_SHADER}
#endif`);
  };
  material.customProgramCacheKey = () => 'kickole-face-hair';
  material.needsUpdate = true;
}

/**
 * Body skin takes the wardrobe swatch. The Hair mesh drops its albedo — male
 * and female Hair materials are named Hair, they have no vertex colours, and
 * the map is a dark photograph — so the swatch is the colour. The photographed
 * face keeps its texture: the crown above the eyes is drawn as the hair swatch.
 * Eyes and the mouth stay as authored.
 */
export function applyWardrobeBodyColours(materials: readonly Material[], skin: Skin): void {
  for (const material of materials) {
    const colored = material as ColouredMaterial;
    if (!colored.color) continue;
    if (material.name === MATERIAL_NAMES.hair) {
      colored.color.set(skin.body.hair);
      colored.map = null;
      colored.needsUpdate = true;
      continue;
    }
    if (material.name === MATERIAL_NAMES.skin && isPhotographedFace(material)) {
      bindPhotographedFace(colored, skin.body.hair, skin.body.skin);
      continue;
    }
    if (material.name !== MATERIAL_NAMES.skin) continue;
    colored.color.set(skin.body.skin);
  }
}

function srgbToLinear(byte: number): number {
  const channel = byte / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function linearToByte(channel: number): number {
  const clamped = Math.min(1, Math.max(0, channel));
  const encoded = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * clamped ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, encoded)) * 255);
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function multiply(color: Color, texel: readonly [number, number, number]): [number, number, number] {
  return [
    linearToByte(color.r * srgbToLinear(texel[0])),
    linearToByte(color.g * srgbToLinear(texel[1])),
    linearToByte(color.b * srgbToLinear(texel[2])),
  ];
}

/**
 * Albedo after the map and the wardrobe shader, before lights. A headless
 * pixel sample is not available in vitest; this is the same mix the face
 * shader writes. `place.y` is bind-pose height on the head mesh.
 */
export function resolveDrawnRgb(
  material: ColouredMaterial & { color: Color },
  texel: readonly [number, number, number],
  place?: { y: number },
): [number, number, number] {
  const uniforms = material.userData.faceUniforms as FaceUniforms | undefined;
  if (material.userData.faceHairBound === true && uniforms && place && material.name === MATERIAL_NAMES.skin) {
    const headMin = uniforms.uHeadMin.value;
    const headSpan = Math.max(0.0001, uniforms.uHeadSpan.value);
    const height = Math.min(1, Math.max(0, (place.y - headMin) / headSpan));
    const linear = [srgbToLinear(texel[0]), srgbToLinear(texel[1]), srgbToLinear(texel[2])];
    const crown = smoothstep(FACE_HAIR.crownLo, FACE_HAIR.crownHi, height);
    const mask = crown;
    const skin = uniforms.uFaceSkin.value;
    const hair = uniforms.uFaceHair.value;
    const shift = [
      linear[0] * (1 - FACE_HAIR.skinMix) + skin.r * FACE_HAIR.skinMix,
      linear[1] * (1 - FACE_HAIR.skinMix) + skin.g * FACE_HAIR.skinMix,
      linear[2] * (1 - FACE_HAIR.skinMix) + skin.b * FACE_HAIR.skinMix,
    ];
    return [
      linearToByte(shift[0] * (1 - mask) + hair.r * mask),
      linearToByte(shift[1] * (1 - mask) + hair.g * mask),
      linearToByte(shift[2] * (1 - mask) + hair.b * mask),
    ];
  }
  const map = material.map ? texel : [255, 255, 255] as const;
  return multiply(material.color, map);
}
