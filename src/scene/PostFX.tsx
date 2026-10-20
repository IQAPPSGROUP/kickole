import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DataTexture,
  HalfFloatType,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GameEngine } from '../engine/engine';
import { STREET_BLOOM, streetPostPassNames, type StreetPassName } from './daylight';
import { depthOfFieldActive, depthOfFieldFocus, depthOfFieldScale, gradeDisplayColor } from './presentation';
import type { TierProfile } from './qualityTier';
import { SsaoPass } from './ssaoPass';

interface SceneStats {
  triangles: number;
  calls: number;
  textures: number;
}

let sceneStats: SceneStats | null = null;

/** Display grade packed as slices. Applied after AgX so skin stays out of the crushed blacks. */
function streetLut(): DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const [red, green, blue] = gradeDisplayColor(r / (size - 1), g / (size - 1), b / (size - 1));
        const x = b * size + r;
        const i = (g * size * size + x) * 4;
        data[i] = Math.round(red * 255);
        data[i + 1] = Math.round(green * 255);
        data[i + 2] = Math.round(blue * 255);
        data[i + 3] = 255;
      }
    }
  }
  const tex = new DataTexture(data, size * size, size, RGBAFormat, UnsignedByteType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.colorSpace = NoColorSpace;
  tex.flipY = false;
  tex.needsUpdate = true;
  tex.generateMipmaps = false;
  return tex;
}

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const LUT_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D uLut;
  varying vec2 vUv;
  void main() {
    vec3 color = clamp(texture2D(tDiffuse, vUv).rgb, 0.0, 1.0);
    float size = 32.0;
    float slice = color.b * (size - 1.0);
    float s0 = floor(slice);
    float s1 = min(s0 + 1.0, size - 1.0);
    float blend = slice - s0;
    vec2 texel = vec2(0.5 / (size * size), 0.5 / size);
    vec2 uv0 = vec2((s0 * size + color.r * (size - 1.0)) / (size * size), color.g * (size - 1.0) / size) + texel;
    vec2 uv1 = vec2((s1 * size + color.r * (size - 1.0)) / (size * size), color.g * (size - 1.0) / size) + texel;
    vec3 graded = mix(texture2D(uLut, uv0).rgb, texture2D(uLut, uv1).rgb, blend);
    gl_FragColor = vec4(graded, 1.0);
  }
`;

const EXTRACT_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform float uThreshold;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
    float keep = smoothstep(uThreshold, uThreshold + 0.18, luma);
    gl_FragColor = vec4(color * keep, 1.0);
  }
`;

const BLUR_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform vec2 uDirection;
  uniform float uSpread;
  varying vec2 vUv;
  void main() {
    vec2 step = uDirection * uSpread;
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
    sum += texture2D(tDiffuse, vUv + step * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv - step * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv + step * 3.230769).rgb * 0.070270;
    sum += texture2D(tDiffuse, vUv - step * 3.230769).rgb * 0.070270;
    gl_FragColor = vec4(sum, 1.0);
  }
`;

const BLOOM_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tBloom;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec3 scene = texture2D(tDiffuse, vUv).rgb;
    vec3 bloom = texture2D(tBloom, vUv).rgb;
    gl_FragColor = vec4(scene + bloom * uStrength, 1.0);
  }
`;

function bloomTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: HalfFloatType,
    depthBuffer: false,
  });
  target.texture.generateMipmaps = false;
  target.texture.name = 'kickole-bloom';
  return target;
}

/**
 * Highlight bloom that writes scene + glow into the composer write buffer.
 * It never clears the beauty target. three.js UnrealBloomPass does, and on
 * this WebGL stack that replace paints the frame black.
 */
class SafeBloomPass extends Pass {
  private readonly strength: number;
  private readonly extract: ShaderMaterial;
  private readonly blur: ShaderMaterial;
  private readonly combine: ShaderMaterial;
  private readonly bright: WebGLRenderTarget;
  private readonly ping: WebGLRenderTarget;
  private readonly quad: FullScreenQuad;

  constructor(width: number, height: number, strength: number, threshold: number) {
    super();
    this.needsSwap = true;
    this.strength = strength;
    const halfW = Math.max(1, Math.round(width / 2));
    const halfH = Math.max(1, Math.round(height / 2));
    this.bright = bloomTarget(halfW, halfH);
    this.ping = bloomTarget(halfW, halfH);
    this.extract = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: threshold } },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: EXTRACT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new Vector2(1 / halfW, 0) },
        uSpread: { value: 4.5 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.combine = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBloom: { value: this.ping.texture }, uStrength: { value: strength } },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLOOM_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.extract);
  }

  override setSize(width: number, height: number) {
    const halfW = Math.max(1, Math.round(width / 2));
    const halfH = Math.max(1, Math.round(height / 2));
    this.bright.setSize(halfW, halfH);
    this.ping.setSize(halfW, halfH);
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const ready = (target: WebGLRenderTarget) => {
      renderer.setRenderTarget(target);
      const gl = renderer.getContext();
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    };
    const draw = (material: ShaderMaterial, target: WebGLRenderTarget | null) => {
      this.quad.material = material;
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    };
    const bloomReady = ready(this.bright) && ready(this.ping);
    if (bloomReady) {
      this.extract.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.bright);
      renderer.clear();
      draw(this.extract, this.bright);

      const blurDir = this.blur.uniforms.uDirection.value as Vector2;
      let source = this.bright;
      let dest = this.ping;
      for (let pass = 0; pass < 2; pass++) {
        blurDir.set(1 / this.bright.width, 0);
        this.blur.uniforms.tDiffuse.value = source.texture;
        renderer.setRenderTarget(dest);
        renderer.clear();
        draw(this.blur, dest);
        blurDir.set(0, 1 / this.bright.height);
        this.blur.uniforms.tDiffuse.value = dest.texture;
        renderer.setRenderTarget(source);
        renderer.clear();
        draw(this.blur, source);
        source = this.bright;
        dest = this.ping;
      }
    }
    this.combine.uniforms.tDiffuse.value = readBuffer.texture;
    this.combine.uniforms.tBloom.value = this.bright.texture;
    this.combine.uniforms.uStrength.value = bloomReady ? this.strength : 0;
    draw(this.combine, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    this.extract.dispose();
    this.blur.dispose();
    this.combine.dispose();
    this.bright.dispose();
    this.ping.dispose();
    this.quad.dispose();
  }
}

class CountingRenderPass extends RenderPass {
  override render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    readBuffer: WebGLRenderTarget,
    deltaTime: number,
    maskActive: boolean,
  ) {
    renderer.info.reset();
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    sceneStats = {
      triangles: renderer.info.render.triangles,
      calls: renderer.info.render.calls,
      textures: renderer.info.memory.textures,
    };
  }
}

const FORWARD = new Vector3();

/**
 * Post stack for every street tier. The composer target is linear, so bloom
 * runs before OutputPass applies AgX. The grade and anti-aliasing follow AgX.
 * Depth of field opens on the title, celebration, and game-over holds.
 */
export function PostFX({ profile, engine }: { profile: TierProfile; engine: GameEngine }) {
  const { gl, scene, camera, size } = useThree();
  const lut = useMemo(() => streetLut(), []);
  const stack = useMemo((): { effect: EffectComposer; bokeh: BokehPass | null } => {
    const effect = new EffectComposer(gl as WebGLRenderer);
    let bokeh: BokehPass | null = null;
    const add = (name: StreetPassName) => {
      switch (name) {
        case 'beauty':
          effect.addPass(new CountingRenderPass(scene, camera));
          break;
        case 'ssao':
          effect.addPass(new SsaoPass(scene, camera, size.width, size.height));
          break;
        case 'bloom':
          effect.addPass(new SafeBloomPass(size.width, size.height, STREET_BLOOM.strength, STREET_BLOOM.threshold));
          break;
        case 'dof':
          bokeh = new BokehPass(scene, camera, { focus: 8, aperture: 0.004, maxblur: 0.014 });
          bokeh.enabled = false;
          effect.addPass(bokeh);
          break;
        case 'agx':
          effect.addPass(new OutputPass());
          break;
        case 'grade':
          effect.addPass(new ShaderPass({
            uniforms: {
              tDiffuse: { value: null },
              uLut: { value: lut },
            },
            vertexShader: FULLSCREEN_VERTEX,
            fragmentShader: LUT_FRAGMENT,
          }));
          break;
        case 'smaa':
          effect.addPass(new SMAAPass());
          break;
        case 'fxaa':
          effect.addPass(new ShaderPass(FXAAShader));
          break;
        default: {
          const neverName: never = name;
          throw new Error(`unexpected post pass ${String(neverName)}`);
        }
      }
    };
    for (const name of streetPostPassNames(profile)) add(name);
    return { effect, bokeh };
  }, [gl, scene, camera, profile.ssao, profile.bloom, profile.dof, profile.aa, lut, size.width, size.height]);

  useEffect(() => {
    stack.effect.setSize(size.width, size.height);
    const fxaa = stack.effect.passes.find((pass) => (pass as ShaderPass).material?.uniforms?.resolution);
    const resolution = (fxaa as ShaderPass | undefined)?.material?.uniforms?.resolution?.value as Vector2 | undefined;
    if (resolution) resolution.set(1 / size.width, 1 / size.height);
  }, [stack, size.width, size.height]);

  useEffect(() => () => {
    lut.dispose();
    for (const pass of stack.effect.passes) pass.dispose();
    stack.effect.dispose();
  }, [stack, lut]);

  useFrame(() => {
    if (stack.bokeh) {
      const celebrating = engine.celebration != null;
      stack.bokeh.enabled = depthOfFieldActive(engine.phase, celebrating);
      if (stack.bokeh.enabled) {
        camera.getWorldDirection(FORWARD);
        const scale = depthOfFieldScale(engine.phase, celebrating);
        const uniforms = stack.bokeh.uniforms as { focus: { value: number }; aperture: { value: number }; maxblur: { value: number } };
        uniforms.focus.value = depthOfFieldFocus(camera.position, FORWARD);
        uniforms.aperture.value = scale.aperture;
        uniforms.maxblur.value = scale.maxblur;
      }
    }
    stack.effect.render();
    if (sceneStats) {
      (globalThis as { __KICKOLE_PERF?: SceneStats }).__KICKOLE_PERF = sceneStats;
    }
  }, 1);

  return null;
}
