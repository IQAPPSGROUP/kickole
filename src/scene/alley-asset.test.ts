// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALLEY_FILES, ALLEY_MURAL, ALLEY_OFFSET } from './alleyLayout';
import { resolveEnvironmentTheme } from './environment';
import { inPlayVolume } from './streetLayout';

function glb(file: string) {
  const bytes = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  const jsonLen = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLen)));
  return { json, bytes };
}

describe('alley environment', () => {
  it('is the default location and keeps street and beach behind an explicit name', () => {
    expect(resolveEnvironmentTheme()).toBe('alley');
    expect(resolveEnvironmentTheme('street')).toBe('street');
    expect(resolveEnvironmentTheme('beach')).toBe('beach');
    expect(resolveEnvironmentTheme('alley', 'street')).toBe('street');
  });

  it('ships one optimised GLB and a smaller phone file with the same meshes', () => {
    const full = glb(ALLEY_FILES.model);
    const low = glb(ALLEY_FILES.modelLow);
    expect(full.json.extensionsRequired).toContain('KHR_draco_mesh_compression');
    expect(full.json.extensionsRequired).toContain('EXT_texture_webp');
    expect(low.json.extensionsRequired).toContain('KHR_draco_mesh_compression');
    const triangles = (doc: { meshes: { primitives: { indices: number }[] }[]; accessors: { count: number }[] }) =>
      doc.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce((inner, prim) => inner + doc.accessors[prim.indices].count / 3, 0), 0);
    expect(triangles(full.json)).toBe(triangles(low.json));
    expect(triangles(full.json)).toBeGreaterThan(20_000);
    expect(triangles(full.json)).toBeLessThan(28_000);
    expect(full.bytes.length).toBeLessThan(4_500_000);
    expect(low.bytes.length).toBeLessThan(full.bytes.length);
    expect(low.bytes.length).toBeLessThan(1_800_000);
  });

  it('keeps props out of the freestyle box and the concrete under the player', () => {
    const { json } = glb(ALLEY_FILES.model);
    let floorHits = 0;
    for (const node of json.nodes as { name: string; mesh: number; translation?: number[] }[]) {
      const translation = node.translation ?? [0, 0, 0];
      const mesh = json.meshes[node.mesh];
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const prim of mesh.primitives) {
        const pos = json.accessors[prim.attributes.POSITION];
        minX = Math.min(minX, pos.min[0]);
        maxX = Math.max(maxX, pos.max[0]);
        minZ = Math.min(minZ, pos.min[2]);
        maxZ = Math.max(maxZ, pos.max[2]);
      }
      const x0 = minX + translation[0] + ALLEY_OFFSET.x;
      const x1 = maxX + translation[0] + ALLEY_OFFSET.x;
      const z0 = minZ + translation[2] + ALLEY_OFFSET.z;
      const z1 = maxZ + translation[2] + ALLEY_OFFSET.z;
      const hitsPlay = x0 < 2.05 && x1 > -2.05 && z0 < 3.3 && z1 > -3.45;
      if (node.name === 'StreetFloor') {
        floorHits += 1;
        expect(inPlayVolume(0, 0)).toBe(true);
        expect(z0).toBeLessThan(-3.45);
        expect(z1).toBeGreaterThan(3.3);
      } else {
        expect(hitsPlay).toBe(false);
      }
    }
    expect(floorHits).toBe(1);
  });

  it('stays out of the downloadable environment kits', () => {
    const beach = readFileSync(new URL('../../public/models/beach/manifest.json', import.meta.url), 'utf8');
    const hillside = readFileSync(new URL('../../public/models/environment/manifest.json', import.meta.url), 'utf8');
    expect(beach.includes('alley_game')).toBe(false);
    expect(hillside.includes('alley_game')).toBe(false);
    expect(ALLEY_FILES.model.startsWith('models/env/')).toBe(true);
  });

  it('keeps the wordmark on the back brick, clear of the play box', () => {
    const [x, y, z] = ALLEY_MURAL.position;
    const [width, height] = ALLEY_MURAL.size;
    expect(z).toBeLessThan(-6.8);
    expect(z).toBeGreaterThan(-7.15);
    expect(y - height / 2).toBeGreaterThan(1.5);
    expect(y + height / 2).toBeLessThan(3.4);
    expect(x - width / 2).toBeGreaterThan(-4.05);
    expect(x + width / 2).toBeLessThan(3.25);
    expect(inPlayVolume(x, z)).toBe(false);
    expect(width / height).toBeGreaterThan(2.5);
  });

  it('uses a local city HDR and a small JPEG fallback', () => {
    const hdr = readFileSync(new URL(`../../public/${ALLEY_FILES.sky}`, import.meta.url));
    const jpg = readFileSync(new URL(`../../public/${ALLEY_FILES.skyLow}`, import.meta.url));
    expect(hdr.subarray(0, 10).toString('utf8')).toBe('#?RADIANCE');
    expect(hdr.length).toBeLessThan(2_000_000);
    expect(jpg.length).toBeLessThan(80_000);
    expect(jpg[0]).toBe(0xff);
  });
});
