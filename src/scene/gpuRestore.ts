import {
  Material,
  Texture,
  type BufferAttribute,
  type InterleavedBufferAttribute,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';

let generation = 0;
const listeners = new Set<() => void>();

/** Bumps when the WebGL context has been restored and GPU copies must be rebuilt. */
export function gpuGeneration(): number {
  return generation;
}

export function subscribeGpuRestore(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyGpuRestore(): void {
  generation += 1;
  for (const listener of listeners) listener();
}

type GeometryLike = {
  attributes: Record<string, BufferAttribute | InterleavedBufferAttribute | undefined>;
  index?: { needsUpdate: boolean } | null;
};

type MeshLike = Object3D & {
  geometry?: GeometryLike;
  material?: Material | Material[];
};

/**
 * ImageBitmaps uploaded before a context loss come back black in WKWebView.
 * Copy the pixels onto a canvas, which `texImage2D` will read again.
 */
export function promoteImageBitmap(texture: Texture): void {
  const image: unknown = texture.image;
  if (typeof ImageBitmap === 'undefined' || !(image instanceof ImageBitmap)) return;
  if (image.width <= 0 || image.height <= 0) return;
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.drawImage(image, 0, 0);
  texture.image = canvas;
}

function visitTexture(texture: unknown, seen: Set<Texture>, upload: (texture: Texture) => void): void {
  if (!(texture instanceof Texture) || seen.has(texture)) return;
  seen.add(texture);
  // PMREM and other render targets have no CPU pixels. Their owner rebuilds them.
  if (texture.isRenderTargetTexture) return;
  promoteImageBitmap(texture);
  texture.needsUpdate = true;
  upload(texture);
}

function visitMaterial(material: Material, seen: Set<Texture>, upload: (texture: Texture) => void): void {
  material.needsUpdate = true;
  const record = material as unknown as Record<string, unknown>;
  for (const key of Object.keys(material)) {
    const value = record[key];
    visitTexture(value, seen, upload);
    if (Array.isArray(value)) {
      for (const entry of value) visitTexture(entry, seen, upload);
    }
  }
  const uniforms = (material as { uniforms?: Record<string, { value?: unknown }> }).uniforms;
  if (!uniforms) return;
  for (const uniform of Object.values(uniforms)) visitTexture(uniform?.value, seen, upload);
}

/**
 * Re-upload every CPU-backed texture and ask materials to recompile.
 * Render-target textures (PMREM, composer, shadows) are skipped; callers rebuild those.
 */
export function reuploadSceneTextures(renderer: WebGLRenderer, scene: Scene): number {
  const seen = new Set<Texture>();
  const upload = (texture: Texture) => {
    try {
      renderer.initTexture(texture);
    } catch (error) {
      console.warn('texture reupload failed', texture.name, error);
    }
  };
  scene.traverse((obj) => {
    const mesh = obj as MeshLike;
    const geometry = mesh.geometry;
    if (geometry) {
      for (const attribute of Object.values(geometry.attributes)) {
        if (attribute) attribute.needsUpdate = true;
      }
      if (geometry.index) geometry.index.needsUpdate = true;
    }
    if (!mesh.material) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) visitMaterial(material, seen, upload);
  });
  visitTexture(scene.background, seen, upload);
  visitTexture(scene.environment, seen, upload);
  if (scene.overrideMaterial) visitMaterial(scene.overrideMaterial, seen, upload);
  renderer.shadowMap.needsUpdate = true;
  return seen.size;
}
