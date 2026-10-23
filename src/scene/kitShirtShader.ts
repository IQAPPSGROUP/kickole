import { Color, type MeshStandardMaterial, type MeshToonMaterial } from 'three';
import type { KitPattern } from '../game/kitColours';
import {
  KIT_CHEVRON_SLOPE,
  KIT_CHEVRON_WIDTH,
  KIT_CHEVRON_Y,
  KIT_HOOP_ORIGIN,
  KIT_HOOP_PERIOD,
  KIT_SASH_SLOPE,
  KIT_SASH_WIDTH,
  KIT_SASH_Y,
  KIT_SLEEVE_X,
  KIT_STRIPE_PERIOD,
} from './kitPattern';

const PATTERN_CODE: Record<KitPattern, number> = {
  plain: 0,
  halves: 1,
  hoops: 2,
  sash: 3,
  chevron: 4,
  sleeves: 5,
  stripes: 6,
};

type ShirtMaterial = MeshStandardMaterial | MeshToonMaterial;

interface KitUniforms {
  uKitMain: { value: Color };
  uKitSecond: { value: Color };
  uKitPattern: { value: number };
}

const MASK = `
float kitMask = 0.0;
float kx = vKitBind.x;
float ky = vKitBind.y;
if (uKitPattern > 0.5 && uKitPattern < 1.5) {
  kitMask = step(0.0, kx);
} else if (uKitPattern < 2.5) {
  kitMask = step(0.5, fract((ky - ${KIT_HOOP_ORIGIN}) / ${KIT_HOOP_PERIOD}));
} else if (uKitPattern < 3.5) {
  kitMask = step(abs(ky - ${KIT_SASH_Y} + ${KIT_SASH_SLOPE} * kx), ${KIT_SASH_WIDTH});
} else if (uKitPattern < 4.5) {
  kitMask = step(abs(ky - ${KIT_CHEVRON_Y} - ${KIT_CHEVRON_SLOPE} * abs(kx)), ${KIT_CHEVRON_WIDTH});
} else if (uKitPattern < 5.5) {
  kitMask = step(${KIT_SLEEVE_X}, abs(kx));
} else if (uKitPattern < 6.5) {
  // Vertical stripes. Hoops use y; this mask uses x.
  kitMask = step(0.5, fract(kx / ${KIT_STRIPE_PERIOD} + 0.5));
}
if (uKitPattern > 0.5) diffuseColor.rgb = mix(uKitMain, uKitSecond, kitMask);
`;

function uniformsFor(material: ShirtMaterial): KitUniforms {
  const existing = material.userData.kitUniforms as KitUniforms | undefined;
  if (existing) return existing;
  const created: KitUniforms = {
    uKitMain: { value: new Color('#ffffff') },
    uKitSecond: { value: new Color('#ffffff') },
    uKitPattern: { value: 0 },
  };
  material.userData.kitUniforms = created;
  return created;
}

/** Shirt-only mask. Shorts, socks and the collar stay solid colours. */
export function applyKitShirtShader(
  material: ShirtMaterial,
  pattern: KitPattern,
  main: string,
  secondary: string,
) {
  const uniforms = uniformsFor(material);
  uniforms.uKitMain.value.set(main);
  uniforms.uKitSecond.value.set(secondary);
  uniforms.uKitPattern.value = PATTERN_CODE[pattern];
  material.userData.kitShirt = true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uKitMain = uniforms.uKitMain;
    shader.uniforms.uKitSecond = uniforms.uKitSecond;
    shader.uniforms.uKitPattern = uniforms.uKitPattern;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vKitBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKitBind = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uKitMain;
uniform vec3 uKitSecond;
uniform float uKitPattern;
varying vec3 vKitBind;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${MASK}`);
  };
  material.customProgramCacheKey = () => 'kit-shirt-mask';
  material.needsUpdate = true;
}

export function clearKitShirtShader(material: ShirtMaterial) {
  if (!material.userData.kitShirt) return;
  material.userData.kitShirt = false;
  material.onBeforeCompile = () => {};
  material.customProgramCacheKey = () => 'kit-shirt-off';
  material.needsUpdate = true;
}
