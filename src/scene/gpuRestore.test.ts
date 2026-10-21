import { describe, expect, it } from 'vitest';
import { CanvasTexture, Mesh, MeshBasicMaterial, Scene, WebGLRenderTarget } from 'three';
import { reuploadSceneTextures } from './gpuRestore';

describe('context restore reupload', () => {
  it('uploads mesh, canvas, and background textures and skips render targets', () => {
    const scene = new Scene();
    const canvas = { width: 4, height: 4 } as HTMLCanvasElement;
    const map = new CanvasTexture(canvas);
    map.name = 'wall';
    scene.add(new Mesh(undefined, new MeshBasicMaterial({ map })));
    const background = new CanvasTexture(canvas);
    background.name = 'sky';
    scene.background = background;
    const environment = new WebGLRenderTarget(8, 8).texture;
    environment.name = 'pmrem';
    scene.environment = environment;
    const uploaded: string[] = [];
    const renderer = {
      initTexture(texture: { name: string }) {
        uploaded.push(texture.name);
      },
      shadowMap: { needsUpdate: false },
    };
    reuploadSceneTextures(renderer as never, scene);
    expect(uploaded).toContain('wall');
    expect(uploaded).toContain('sky');
    expect(uploaded).not.toContain('pmrem');
    expect(map.version).toBeGreaterThan(0);
    expect(renderer.shadowMap.needsUpdate).toBe(true);
    map.dispose();
    background.dispose();
  });
});
