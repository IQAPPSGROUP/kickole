import { Color, type MeshStandardMaterial, type MeshToonMaterial } from 'three';
import type { KitPattern } from '../game/kitColours';
import { KIT_STRIPE_PERIOD, KIT_TRIM_METRICS, KIT_TRIM_SLOTS, type KitBody } from './kitPattern';

const PATTERN_CODE: Record<KitPattern, number> = {
  plain: 0,
  stripes: 1,
};

const ZONE_CODE = {
  shirt: 0,
  collar: 1,
  socks: 2,
} as const;

export type KitClothZone = keyof typeof ZONE_CODE;

type ShirtMaterial = MeshStandardMaterial | MeshToonMaterial;

interface KitUniforms {
  uKitMain: { value: Color };
  uKitSecond: { value: Color };
  uKitSock: { value: Color };
  uKitPattern: { value: number };
  uKitZone: { value: number };
  uTrimCount: { value: number };
  uCuffX: { value: number };
  uCuffSpan: { value: number };
  uCollar0: { value: number };
  uCollar1: { value: number };
  uSockTop: { value: number };
  uSockSpan: { value: number };
  uTrim: Color[];
}

const TRIM_GLSL = Array.from({ length: KIT_TRIM_SLOTS }, (_, index) => `uniform vec3 uTrim${index};`).join('\n');
const TRIM_PICK = Array.from({ length: KIT_TRIM_SLOTS }, (_, index) => (
  index === 0 ? 'vec3 trimColor = uTrim0;' : `if (band > ${index - 0.5}) trimColor = uTrim${index};`
)).join('\n');

const MASK = `
float kx = vKitBind.x;
float ky = vKitBind.y;
float bandT = 0.0;
float useTrim = 0.0;
vec3 kitColor = uKitMain;
if (uKitZone < 0.5) {
  if (uKitPattern > 0.5) {
    kitColor = mix(uKitMain, uKitSecond, step(0.5, fract(kx / ${KIT_STRIPE_PERIOD} + 0.5)));
  }
  if (abs(kx) >= uCuffX) {
    bandT = clamp((abs(kx) - uCuffX) / max(uCuffSpan, 0.0001), 0.0, 0.999);
    useTrim = 1.0;
  }
} else if (uKitZone < 1.5) {
  bandT = clamp((ky - uCollar0) / max(uCollar1 - uCollar0, 0.0001), 0.0, 0.999);
  useTrim = 1.0;
} else {
  kitColor = uKitSock;
  if (ky >= uSockTop) {
    bandT = clamp((ky - uSockTop) / max(uSockSpan, 0.0001), 0.0, 0.999);
    useTrim = 1.0;
  }
}
if (useTrim > 0.5) {
  float band = floor(bandT * max(uTrimCount, 1.0));
  ${TRIM_PICK}
  kitColor = trimColor;
}
diffuseColor.rgb = kitColor;
`;

function uniformsFor(material: ShirtMaterial): KitUniforms {
  const existing = material.userData.kitUniforms as KitUniforms | undefined;
  if (existing) return existing;
  const created: KitUniforms = {
    uKitMain: { value: new Color('#ffffff') },
    uKitSecond: { value: new Color('#ffffff') },
    uKitSock: { value: new Color('#ffffff') },
    uKitPattern: { value: 0 },
    uKitZone: { value: 0 },
    uTrimCount: { value: 1 },
    uCuffX: { value: KIT_TRIM_METRICS.male.cuffX },
    uCuffSpan: { value: KIT_TRIM_METRICS.male.cuffSpan },
    uCollar0: { value: KIT_TRIM_METRICS.male.collar0 },
    uCollar1: { value: KIT_TRIM_METRICS.male.collar1 },
    uSockTop: { value: KIT_TRIM_METRICS.male.sockTop },
    uSockSpan: { value: KIT_TRIM_METRICS.male.sockSpan },
    uTrim: Array.from({ length: KIT_TRIM_SLOTS }, () => new Color('#ffffff')),
  };
  material.userData.kitUniforms = created;
  return created;
}

export interface KitClothPaint {
  pattern: KitPattern;
  main: string;
  secondary: string;
  socks: string;
  trim: readonly string[];
  zone: KitClothZone;
  body: KitBody;
}

/** Shirt pattern, collar bands, cuff bands and sock-top bands. Shorts stay a solid colour. */
export function applyKitClothShader(material: ShirtMaterial, paint: KitClothPaint) {
  const uniforms = uniformsFor(material);
  const metrics = KIT_TRIM_METRICS[paint.body];
  const bands = paint.trim.length > 0 ? paint.trim : [paint.main];
  uniforms.uKitMain.value.set(paint.main);
  uniforms.uKitSecond.value.set(paint.secondary);
  uniforms.uKitSock.value.set(paint.socks);
  uniforms.uKitPattern.value = PATTERN_CODE[paint.pattern];
  uniforms.uKitZone.value = ZONE_CODE[paint.zone];
  uniforms.uTrimCount.value = Math.min(KIT_TRIM_SLOTS, bands.length);
  uniforms.uCuffX.value = metrics.cuffX;
  uniforms.uCuffSpan.value = metrics.cuffSpan;
  uniforms.uCollar0.value = metrics.collar0;
  uniforms.uCollar1.value = metrics.collar1;
  uniforms.uSockTop.value = metrics.sockTop;
  uniforms.uSockSpan.value = metrics.sockSpan;
  for (let index = 0; index < KIT_TRIM_SLOTS; index += 1) {
    const color = uniforms.uTrim[index];
    if (!color) continue;
    color.set(bands[Math.min(index, bands.length - 1)] ?? paint.main);
  }
  material.userData.kitShirt = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uKitMain = uniforms.uKitMain;
    shader.uniforms.uKitSecond = uniforms.uKitSecond;
    shader.uniforms.uKitSock = uniforms.uKitSock;
    shader.uniforms.uKitPattern = uniforms.uKitPattern;
    shader.uniforms.uKitZone = uniforms.uKitZone;
    shader.uniforms.uTrimCount = uniforms.uTrimCount;
    shader.uniforms.uCuffX = uniforms.uCuffX;
    shader.uniforms.uCuffSpan = uniforms.uCuffSpan;
    shader.uniforms.uCollar0 = uniforms.uCollar0;
    shader.uniforms.uCollar1 = uniforms.uCollar1;
    shader.uniforms.uSockTop = uniforms.uSockTop;
    shader.uniforms.uSockSpan = uniforms.uSockSpan;
    uniforms.uTrim.forEach((color, index) => {
      shader.uniforms[`uTrim${index}`] = { value: color };
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uKitMain;
uniform vec3 uKitSecond;
uniform vec3 uKitSock;
uniform float uKitPattern;
uniform float uKitZone;
uniform float uTrimCount;
uniform float uCuffX;
uniform float uCuffSpan;
uniform float uCollar0;
uniform float uCollar1;
uniform float uSockTop;
uniform float uSockSpan;
${TRIM_GLSL}
varying vec3 vKitBind;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MASK}`);
  };
  material.customProgramCacheKey = () => 'kit-cloth-mask';
  material.needsUpdate = true;
}

export function clearKitClothShader(material: ShirtMaterial) {
  if (!material.userData.kitShirt) return;
  material.userData.kitShirt = false;
  material.onBeforeCompile = () => {};
  material.customProgramCacheKey = () => 'kit-cloth-off';
  material.needsUpdate = true;
}
