import {
  DepthFormat,
  DepthTexture,
  MeshDepthMaterial,
  NoBlending,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  Vector3,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';

const AO_SAMPLES = 12;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const AO_FRAGMENT = /* glsl */ `
  uniform sampler2D tDepth;
  uniform vec3 uKernel[${AO_SAMPLES}];
  uniform mat4 uProjection;
  uniform mat4 uInverseProjection;
  uniform float uRadius;
  uniform float uBias;
  varying vec2 vUv;

  vec3 viewAt(vec2 uv, float depth) {
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = uInverseProjection * clip;
    return view.xyz / max(view.w, 0.0001);
  }

  void main() {
    float depth = texture2D(tDepth, vUv).r;
    if (depth <= 0.0008 || depth >= 0.9992) {
      gl_FragColor = vec4(1.0);
      return;
    }
    vec3 pos = viewAt(vUv, depth);
    vec3 normal = normalize(cross(dFdx(pos), dFdy(pos)));
    if (dot(normal, vec3(0.0, 0.0, 1.0)) < 0.0) normal = -normal;
    vec3 tangent = normalize(cross(normal, vec3(0.0, 1.0, 0.02)));
    vec3 bitangent = cross(normal, tangent);
    float occ = 0.0;
    for (int i = 0; i < ${AO_SAMPLES}; i++) {
      vec3 k = uKernel[i];
      vec3 samplePos = pos + (tangent * k.x + bitangent * k.y + normal * k.z) * uRadius;
      vec4 clip = uProjection * vec4(samplePos, 1.0);
      vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.y < 0.0 || suv.x > 1.0 || suv.y > 1.0) continue;
      float sampleDepth = texture2D(tDepth, suv).r;
      if (sampleDepth <= 0.0008 || sampleDepth >= 0.9992) continue;
      vec3 scene = viewAt(suv, sampleDepth);
      float range = smoothstep(0.0, 1.0, uRadius / max(abs(pos.z - scene.z), 0.0001));
      occ += step(samplePos.z + uBias, scene.z) * range;
    }
    float ao = pow(clamp(1.0 - occ / float(${AO_SAMPLES}), 0.0, 1.0), 1.35);
    gl_FragColor = vec4(vec3(ao), 1.0);
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

const COMPOSITE_FRAGMENT = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tAo;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec3 color = texture2D(tDiffuse, vUv).rgb;
    float ao = texture2D(tAo, vUv).r;
    float shade = mix(1.0 - uStrength, 1.0, clamp(ao, 0.0, 1.0));
    gl_FragColor = vec4(color * shade, 1.0);
  }
`;

/** Hemisphere kernel, denser near the origin. Fixed so the shading does not flicker between loads. */
export function buildAoKernel(count = AO_SAMPLES): Vector3[] {
  const kernel: Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const phi = i * 2.399963229728653;
    const z = (i + 0.5) / count;
    const ring = Math.sqrt(Math.max(0, 1 - z * z));
    const scale = 0.12 + (i / count) ** 2 * 0.88;
    kernel.push(new Vector3(Math.cos(phi) * ring * scale, Math.sin(phi) * ring * scale, z * scale));
  }
  return kernel;
}

function byteTarget(width: number, height: number): WebGLRenderTarget {
  const target = new WebGLRenderTarget(Math.max(1, width), Math.max(1, height), { depthBuffer: false });
  target.texture.generateMipmaps = false;
  target.texture.name = 'kickole-ao';
  return target;
}

/**
 * Hemisphere SSAO from a depth prepass. A missing depth buffer copies the colour
 * through, so a failed framebuffer cannot paint the street black.
 */
export class SsaoPass extends Pass {
  private readonly scene: Scene;
  private readonly camera: Camera;
  private readonly depthTarget: WebGLRenderTarget;
  private readonly depthMaterial: MeshDepthMaterial;
  private readonly aoTarget: WebGLRenderTarget;
  private readonly ping: WebGLRenderTarget;
  private readonly aoMaterial: ShaderMaterial;
  private readonly blurMaterial: ShaderMaterial;
  private readonly compositeMaterial: ShaderMaterial;
  private readonly quad: FullScreenQuad;

  constructor(scene: Scene, camera: Camera, width: number, height: number) {
    super();
    this.needsSwap = true;
    this.scene = scene;
    this.camera = camera;
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.depthTarget = byteTarget(w, h);
    const depth = new DepthTexture(w, h);
    depth.format = DepthFormat;
    depth.type = UnsignedIntType;
    this.depthTarget.depthTexture = depth;
    this.depthTarget.depthBuffer = true;
    this.depthMaterial = new MeshDepthMaterial();
    this.depthMaterial.blending = NoBlending;
    const halfW = Math.max(1, Math.round(w / 2));
    const halfH = Math.max(1, Math.round(h / 2));
    this.aoTarget = byteTarget(halfW, halfH);
    this.ping = byteTarget(halfW, halfH);
    this.aoMaterial = new ShaderMaterial({
      uniforms: {
        tDepth: { value: depth },
        uKernel: { value: buildAoKernel() },
        uProjection: { value: camera.projectionMatrix },
        uInverseProjection: { value: camera.projectionMatrixInverse },
        uRadius: { value: 0.42 },
        uBias: { value: 0.025 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: AO_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.blurMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        uDirection: { value: new Vector2(1 / halfW, 0) },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLUR_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.compositeMaterial = new ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tAo: { value: this.aoTarget.texture },
        uStrength: { value: 0.42 },
      },
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.aoMaterial);
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, width);
    const h = Math.max(1, height);
    this.depthTarget.setSize(w, h);
    const halfW = Math.max(1, Math.round(w / 2));
    const halfH = Math.max(1, Math.round(h / 2));
    this.aoTarget.setSize(halfW, halfH);
    this.ping.setSize(halfW, halfH);
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

    const draw = (material: ShaderMaterial, target: WebGLRenderTarget | null) => {
      this.quad.material = material;
      renderer.setRenderTarget(target);
      this.quad.render(renderer);
    };

    this.compositeMaterial.uniforms.tDiffuse.value = readBuffer.texture;
    this.compositeMaterial.uniforms.uStrength.value = complete ? 0.42 : 0;
    if (complete) {
      this.aoMaterial.uniforms.uProjection.value = this.camera.projectionMatrix;
      this.aoMaterial.uniforms.uInverseProjection.value = this.camera.projectionMatrixInverse;
      renderer.setRenderTarget(this.aoTarget);
      renderer.clear();
      draw(this.aoMaterial, this.aoTarget);

      const direction = this.blurMaterial.uniforms.uDirection.value as Vector2;
      direction.set(1 / this.aoTarget.width, 0);
      this.blurMaterial.uniforms.tDiffuse.value = this.aoTarget.texture;
      renderer.setRenderTarget(this.ping);
      renderer.clear();
      draw(this.blurMaterial, this.ping);

      direction.set(0, 1 / this.aoTarget.height);
      this.blurMaterial.uniforms.tDiffuse.value = this.ping.texture;
      renderer.setRenderTarget(this.aoTarget);
      renderer.clear();
      draw(this.blurMaterial, this.aoTarget);
    }
    draw(this.compositeMaterial, this.renderToScreen ? null : writeBuffer);
  }

  override dispose() {
    this.depthTarget.dispose();
    this.depthMaterial.dispose();
    this.aoTarget.dispose();
    this.ping.dispose();
    this.aoMaterial.dispose();
    this.blurMaterial.dispose();
    this.compositeMaterial.dispose();
    this.quad.dispose();
  }
}
