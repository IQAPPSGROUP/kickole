import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  DataTexture,
  DepthFormat,
  DepthTexture,
  MeshDepthMaterial,
  NearestFilter,
  NoBlending,
  NoColorSpace,
  RGBAFormat,
  ShaderMaterial,
  UnsignedByteType,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import type { GameEngine } from '../engine/engine';
import type { TierProfile } from './qualityTier';

interface SceneStats {
  triangles: number;
  calls: number;
  textures: number;
}

let sceneStats: SceneStats | null = null;

/** 16³ display grade packed as 16 slices. Shadows stay neutral, highlights pick up street gold. */
function streetLut(): DataTexture {
  const size = 16;
  const data = new Uint8Array(size * size * size * 4);
  const grade = (c: number) => {
    const contrasted = (c - 0.5) * 1.22 + 0.5;
    return Math.min(1, Math.max(0, contrasted));
  };
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        let red = grade(r / (size - 1));
        let green = grade(g / (size - 1));
        let blue = grade(b / (size - 1));
        red = Math.min(1, red * 1.05);
        blue = Math.min(1, blue * 0.94);
        const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        red = luma + (red - luma) * 1.08;
        green = luma + (green - luma) * 1.04;
        blue = luma + (blue - luma) * 0.96;
        const x = b * size + r;
        const i = (g * size * size + x) * 4;
        data[i] = Math.round(Math.min(1, Math.max(0, red)) * 255);
        data[i + 1] = Math.round(Math.min(1, Math.max(0, green)) * 255);
        data[i + 2] = Math.round(Math.min(1, Math.max(0, blue)) * 255);
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
    float size = 16.0;
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
  varying vec2 vUv;
  void main() {
    vec3 sum = texture2D(tDiffuse, vUv).rgb * 0.227027;
    sum += texture2D(tDiffuse, vUv + uDirection * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv - uDirection * 1.384615).rgb * 0.316216;
    sum += texture2D(tDiffuse, vUv + uDirection * 3.230769).rgb * 0.070270;
    sum += texture2D(tDiffuse, vUv - uDirection * 3.230769).rgb * 0.070270;
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

const AO_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tDepth;
  uniform vec2 uTexel;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float center = texture2D(tDepth, vUv).r;
    float shade = 1.0;
    if (center > 0.001 && center < 0.999) {
      float occ = 0.0;
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(uTexel.x, 0.0)).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(-uTexel.x, 0.0)).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(0.0, uTexel.y)).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(0.0, -uTexel.y)).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(uTexel.x, uTexel.y) * 2.0).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(-uTexel.x, -uTexel.y) * 2.0).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(uTexel.x, -uTexel.y) * 2.0).r);
      occ += smoothstep(0.0008, 0.02, center - texture2D(tDepth, vUv + vec2(-uTexel.x, uTexel.y) * 2.0).r);
      shade = mix(0.7, 1.0, 1.0 - occ / 8.0);
    }
    gl_FragColor = vec4(color * shade, 1.0);
  }
`;

function byteTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: UnsignedByteType,
    depthBuffer: false,
  });
  target.texture.generateMipmaps = false;
  target.texture.name = 'kickole-post';
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
    this.bright = byteTarget(halfW, halfH);
    this.ping = byteTarget(halfW, halfH);
    this.extract = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uThreshold: { value: threshold } },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: EXTRACT_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.blur = new ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uDirection: { value: new Vector2(1 / halfW, 0) } },
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
      blurDir.set(1 / this.bright.width, 0);
      this.blur.uniforms.tDiffuse.value = this.bright.texture;
      renderer.setRenderTarget(this.ping);
      renderer.clear();
      draw(this.blur, this.ping);

      blurDir.set(0, 1 / this.bright.height);
      this.blur.uniforms.tDiffuse.value = this.ping.texture;
      renderer.setRenderTarget(this.bright);
      renderer.clear();
      draw(this.blur, this.bright);
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

/**
 * Depth-aware darkening. The occlusion is multiplied in the shader that
 * writes the next buffer, so a missing depth sample leaves the colour alone.
 */
class SafeAoPass extends Pass {
  private readonly depthTarget: WebGLRenderTarget;
  private readonly depthMaterial: MeshDepthMaterial;
  private readonly composite: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly scene: Scene;
  private readonly camera: Camera;

  constructor(scene: Scene, camera: Camera, width: number, height: number) {
    super();
    this.needsSwap = true;
    this.scene = scene;
    this.camera = camera;
    this.depthTarget = byteTarget(width, height);
    const depth = new DepthTexture(width, height);
    depth.format = DepthFormat;
    depth.type = UnsignedIntType;
    this.depthTarget.depthTexture = depth;
    this.depthTarget.depthBuffer = false;
    this.depthMaterial = new MeshDepthMaterial();
    this.depthMaterial.blending = NoBlending;
    this.composite = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tDepth: { value: depth },
        uTexel: { value: new Vector2(2 / width, 2 / height) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: AO_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.composite);
  }

  override setSize(width: number, height: number) {
    this.depthTarget.setSize(Math.max(1, width), Math.max(1, height));
    const texel = this.composite.uniforms.uTexel.value as Vector2;
    texel.set(2 / Math.max(1, width), 2 / Math.max(1, height));
  }

  override render(renderer: WebGLRenderer, writeBuffer: WebGLRenderTarget, readBuffer: WebGLRenderTarget) {
    const previous = this.scene.overrideMaterial;
    this.scene.overrideMaterial = this.depthMaterial;
    renderer.setRenderTarget(this.depthTarget);
    const gl = renderer.getContext();
    const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    if (complete) {
      renderer.clear();
      renderer.render(this.scene, this.camera);
    }
    this.scene.overrideMaterial = previous;
    this.composite.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material = this.composite;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  override dispose() {
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.composite.dispose();
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

/**
 * Post stack for mid and high. A priority-1 frame replaces the default render.
 * Depth of field only opens on the game-over hold, which is the replay view.
 */
export function PostFX({ profile, engine }: { profile: TierProfile; engine: GameEngine }) {
  const { gl, scene, camera, size } = useThree();
  const lut = useMemo(() => streetLut(), []);
  const stack = useMemo(() => {
    const effect = new EffectComposer(gl as WebGLRenderer);
    effect.addPass(new CountingRenderPass(scene, camera));
    if (profile.ssao) effect.addPass(new SafeAoPass(scene, camera, size.width, size.height));
    if (profile.bloom) effect.addPass(new SafeBloomPass(size.width, size.height, 0.28, 0.62));
    let bokeh: BokehPass | null = null;
    if (profile.dof) {
      bokeh = new BokehPass(scene, camera, { focus: 7.2, aperture: 0.00012, maxblur: 0.006 });
      bokeh.enabled = false;
      effect.addPass(bokeh);
    }
    effect.addPass(new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uLut: { value: lut },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: LUT_FRAGMENT,
    }));
    effect.addPass(new OutputPass());
    if (profile.fxaa) effect.addPass(new ShaderPass(FXAAShader));
    return { effect, bokeh };
  }, [gl, scene, camera, profile.ssao, profile.bloom, profile.dof, profile.fxaa, lut, size.width, size.height]);

  useEffect(() => {
    stack.effect.setSize(size.width, size.height);
    const fxaa = stack.effect.passes.find((pass) => (pass as ShaderPass).material?.uniforms?.resolution);
    const resolution = (fxaa as ShaderPass | undefined)?.material?.uniforms?.resolution?.value as Vector2 | undefined;
    if (resolution) resolution.set(1 / size.width, 1 / size.height);
  }, [stack, size.width, size.height]);

  useEffect(() => () => {
    lut.dispose();
    stack.effect.dispose();
  }, [stack, lut]);

  useFrame(() => {
    if (stack.bokeh) stack.bokeh.enabled = engine.phase === 'over';
    stack.effect.render();
    if (sceneStats) {
      (globalThis as { __KICKOLE_PERF?: SceneStats }).__KICKOLE_PERF = sceneStats;
    }
  }, 1);

  return null;
}
