import { ClampToEdgeWrapping, Color, DataTexture, MeshToonMaterial, NearestFilter, NoColorSpace, RGBFormat, type Material, type MeshStandardMaterial } from 'three';

let gradient: DataTexture | null = null;

/** 3-step cel ramp. Shadow band is navy-violet so the unlit side stays in the sunset palette. */
export function toonGradient(): DataTexture {
  if (gradient) return gradient;
  const data = new Uint8Array([
    52, 48, 78,
    176, 170, 184,
    255, 252, 248,
  ]);
  gradient = new DataTexture(data, 3, 1, RGBFormat);
  gradient.magFilter = NearestFilter;
  gradient.minFilter = NearestFilter;
  gradient.colorSpace = NoColorSpace;
  gradient.wrapS = gradient.wrapT = ClampToEdgeWrapping;
  gradient.needsUpdate = true;
  return gradient;
}

export type ToonRole = 'skin' | 'shirt' | 'flat';

const NAVY = new Color('#1E2A5A');

/**
 * One shared toon program: skin keeps the eye atlas, the shirt gets a navy sash,
 * and a rim stands in for a second outline pass.
 */
export function bindSunsetToon(material: MeshToonMaterial, role: ToonRole, trim: string): void {
  material.gradientMap = toonGradient();
  material.userData.trim = trim;
  material.userData.role = role;
  material.onBeforeCompile = (shader) => {
    material.userData.shader = shader;
    shader.uniforms.uTrim = { value: new Color(material.userData.trim as string) };
    shader.uniforms.uRole = { value: role === 'skin' ? 1 : role === 'shirt' ? 2 : 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vToonPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvToonPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vToonPos;\nuniform vec3 uTrim;\nuniform float uRole;')
      .replace('#include <map_fragment>', `#include <map_fragment>
if (uRole > 0.5 && uRole < 1.5) {
#ifdef USE_MAP
  if (vMapUv.x > 0.745) diffuseColor.rgb = sampledDiffuseColor.rgb;
  else {
    float luma = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
    diffuseColor.rgb = diffuse * mix(0.58, 1.18, clamp(luma, 0.0, 1.0));
  }
#endif
}
if (uRole > 1.5) {
  float sash = smoothstep(0.055, 0.0, abs(vToonPos.x * 0.85 + (vToonPos.y - 1.18)));
  diffuseColor.rgb = mix(diffuseColor.rgb, uTrim, sash);
}`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        `vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
float toonRim = pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), 2.5);
outgoingLight = mix(outgoingLight, vec3(${NAVY.r.toFixed(4)}, ${NAVY.g.toFixed(4)}, ${NAVY.b.toFixed(4)}), toonRim * 0.7);`,
      );
  };
  material.customProgramCacheKey = () => 'kickole-sunset-toon';
  material.needsUpdate = true;
}

export function setToonTrim(material: MeshToonMaterial, trim: string): void {
  material.userData.trim = trim;
  const shader = material.userData.shader as { uniforms: { uTrim: { value: Color } } } | undefined;
  if (shader) shader.uniforms.uTrim.value.set(trim);
}

export function toToonMaterial(source: Material, keepMap: boolean): MeshToonMaterial {
  const std = source as MeshStandardMaterial;
  return new MeshToonMaterial({
    name: source.name,
    color: std.color?.clone?.() ?? '#ffffff',
    map: keepMap ? std.map ?? null : null,
    gradientMap: toonGradient(),
    side: std.side,
  });
}
