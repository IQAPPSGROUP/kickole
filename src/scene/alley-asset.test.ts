// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { ALLEY_FILES, ALLEY_MURAL, ALLEY_OFFSET, alleySkyUrl } from './alleyLayout';
import { resolveEnvironmentTheme } from './environment';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';
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
    expect(y - height / 2).toBeGreaterThan(2.2);
    expect(y + height / 2).toBeLessThan(3.6);
    expect(x - width / 2).toBeGreaterThan(-4.05);
    expect(x + width / 2).toBeLessThan(3.25);
    expect(inPlayVolume(x, z)).toBe(false);
    expect(width / height).toBeGreaterThan(2.5);
  });

  it('shows the full wordmark between the phone HUD and the player', () => {
    const [x, y, z] = ALLEY_MURAL.position;
    const [width, height] = ALLEY_MURAL.size;
    const letterTop = y + height / 2 - (96 / 368) * height;
    const letterBottom = y + height / 2 - (296 / 368) * height;
    const point = new Vector3();
    for (const aspect of [390 / 844, 430 / 932]) {
      const cam = new PerspectiveCamera(GAMEPLAY_FOV, aspect, 0.1, 200);
      gameplayCameraPosition(aspect, cam.position);
      cam.lookAt(GAMEPLAY_TARGET);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      const horiz = Math.hypot(GAMEPLAY_TARGET.x - cam.position.x, GAMEPLAY_TARGET.z - cam.position.z);
      const pitch = Math.atan2(cam.position.y - GAMEPLAY_TARGET.y, horiz) * 180 / Math.PI;
      expect(cam.position.y).toBeGreaterThan(2.02);
      expect(cam.position.y).toBeLessThan(2.14);
      expect(cam.position.z).toBeGreaterThan(6.4);
      expect(cam.position.z).toBeLessThan(6.7);
      expect(GAMEPLAY_TARGET.y).toBeGreaterThan(0.8);
      expect(GAMEPLAY_TARGET.y).toBeLessThan(0.92);
      expect(GAMEPLAY_TARGET.z).toBeGreaterThan(0);
      expect(GAMEPLAY_TARGET.z).toBeLessThan(0.2);
      expect(pitch).toBeGreaterThan(6);
      expect(pitch).toBeLessThan(14);
      const screen = (px: number, py: number, pz: number) => {
        point.set(px, py, pz).project(cam);
        return { x: point.x * 0.5 + 0.5, y: 1 - (point.y * 0.5 + 0.5) };
      };
      const letters = [
        screen(x - width / 2, letterTop, z),
        screen(x + width / 2, letterTop, z),
        screen(x - width / 2, letterBottom, z),
        screen(x + width / 2, letterBottom, z),
      ];
      const muralTop = y + height / 2;
      const muralBottom = y - height / 2;
      const mural = [
        screen(x - width / 2, muralTop, z),
        screen(x + width / 2, muralTop, z),
        screen(x - width / 2, muralBottom, z),
        screen(x + width / 2, muralBottom, z),
      ];
      for (const corner of [...letters, ...mural]) {
        // Right of the top-left score card, fully on screen, above the chain-link.
        expect(corner.x).toBeGreaterThan(0.38);
        expect(corner.x).toBeLessThan(0.99);
        expect(corner.y).toBeGreaterThan(0.08);
        expect(corner.y).toBeLessThan(0.36);
      }
      const crown = screen(0, 1.75, 0.02);
      const feet = screen(0, 0, 0.02);
      const body = feet.y - crown.y;
      expect(body).toBeGreaterThan(0.34);
      expect(body).toBeLessThan(0.46);
      // Feet sit between the old high frame and the low frame, still above the buttons.
      expect(feet.y).toBeGreaterThan(0.64);
      expect(feet.y).toBeLessThan(0.72);
      expect(feet.x).toBeGreaterThan(0.46);
      expect(feet.x).toBeLessThan(0.54);
      expect(crown.y).toBeGreaterThan(letters[2].y + 0.1);
      const ballBottom = screen(0, 0.19, 0.42);
      const apex = screen(0, 2.15, 0.3);
      expect(ballBottom.y).toBeLessThan(0.86);
      expect(ballBottom.y).toBeLessThan(feet.y + 0.02);
      expect(apex.y).toBeGreaterThan(0.02);
      expect(apex.y).toBeLessThan(ballBottom.y);
      const fence = screen(0.4, 2.115, -4.14);
      expect(letters[2].y).toBeLessThan(fence.y - 0.01);
      expect(letters[3].y).toBeLessThan(fence.y - 0.01);
    }
  });

  it('uses a local city HDR and a small JPEG fallback', () => {
    const hdr = readFileSync(new URL(`../../public/${ALLEY_FILES.sky}`, import.meta.url));
    const jpg = readFileSync(new URL(`../../public/${ALLEY_FILES.skyLow}`, import.meta.url));
    expect(hdr.subarray(0, 10).toString('utf8')).toBe('#?RADIANCE');
    expect(hdr.length).toBeLessThan(2_000_000);
    expect(jpg.length).toBeLessThan(80_000);
    expect(jpg[0]).toBe(0xff);
    expect(alleySkyUrl('high')).toContain(ALLEY_FILES.skyLow);
    expect(alleySkyUrl('medium')).toContain(ALLEY_FILES.skyLow);
    expect(alleySkyUrl('low')).toContain(ALLEY_FILES.skyLow);
  });
});
