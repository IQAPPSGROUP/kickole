// @vitest-environment node
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { profileFor } from './qualityTier';
import { LAMP_SPOTS, STREET_FILES, crowdPlacements, fenceSlots, inPlayVolume, streetUrl } from './streetLayout';

const KTX2 = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb]);

function glb(file: string) {
  const buf = readFileSync(new URL(`../../public/${file}`, import.meta.url));
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  const jsonLength = view.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))) as {
    extensionsRequired?: string[];
    meshes?: { primitives: { attributes: { POSITION: number }; indices?: number }[] }[];
    accessors?: { count: number }[];
    buffers?: { uri?: string }[];
  };
  return { json, bytes: buf.length };
}

function triangles(file: string) {
  const { json } = glb(file);
  let count = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives) {
      const index = prim.indices;
      count += index === undefined ? 0 : (json.accessors?.[index]?.count ?? 0) / 3;
    }
  }
  return count;
}

describe('street court delivery', () => {
  it('keeps every environment URL on the local bundle', () => {
    for (const file of Object.values(STREET_FILES)) {
      expect(file.startsWith('textures/') || file.startsWith('models/')).toBe(true);
      expect(file).not.toMatch(/https?:|gstatic|polyhaven|ambientcg|unpkg|jsdelivr/i);
      expect(streetUrl(file)).not.toMatch(/https?:\/\//);
    }
  });

  it('ships KTX2 textures and a smaller low-tier court', () => {
    for (const file of [STREET_FILES.courtColor, STREET_FILES.courtNormal, STREET_FILES.courtRough, STREET_FILES.courtColorLow, STREET_FILES.streetAsphalt, STREET_FILES.wallColor, STREET_FILES.wallColorLow, STREET_FILES.concreteColor, STREET_FILES.decalSkid, STREET_FILES.decalStencil, STREET_FILES.decalTag]) {
      const bytes = readFileSync(new URL(`../../public/${file}`, import.meta.url));
      expect(bytes.subarray(0, 8).equals(KTX2)).toBe(true);
    }
    const high = statSync(new URL(`../../public/${STREET_FILES.courtColor}`, import.meta.url)).size;
    const low = statSync(new URL(`../../public/${STREET_FILES.courtColorLow}`, import.meta.url)).size;
    expect(low).toBeLessThan(high);
    expect(statSync(new URL(`../../public/${STREET_FILES.courtNormal}`, import.meta.url)).size).toBeLessThan(2_000_000);
  });

  it('compresses fence, lamp and crowd meshes with meshopt and falling LODs', () => {
    for (const file of [STREET_FILES.fenceLod0, STREET_FILES.fenceLod1, STREET_FILES.lamp, STREET_FILES.crowdLod0, STREET_FILES.crowdLod1, STREET_FILES.crowdLod2]) {
      const { json, bytes } = glb(file);
      expect(json.extensionsRequired).toContain('EXT_meshopt_compression');
      expect(json.buffers?.[0]?.uri).toBeUndefined();
      expect(bytes).toBeLessThan(80_000);
    }
    const crowd0 = triangles(STREET_FILES.crowdLod0);
    const crowd1 = triangles(STREET_FILES.crowdLod1);
    const crowd2 = triangles(STREET_FILES.crowdLod2);
    expect(crowd0).toBeGreaterThan(crowd1);
    expect(crowd1).toBeGreaterThan(crowd2);
    expect(triangles(STREET_FILES.fenceLod0)).toBeGreaterThan(triangles(STREET_FILES.fenceLod1));
    expect(profileFor('high').crowdLod).toBe(0);
    expect(profileFor('medium').crowdLod).toBe(1);
    expect(profileFor('low').crowdLod).toBe(2);
  });

  it('keeps spectators and the chain-link fence outside the play box', () => {
    for (const count of [8, 14, 22]) {
      const spots = crowdPlacements(count);
      expect(spots).toHaveLength(count);
      for (const spot of spots) expect(inPlayVolume(spot.x, spot.z)).toBe(false);
    }
    for (const slot of [...fenceSlots('link'), ...fenceSlots('sparse')]) {
      expect(inPlayVolume(slot.x, slot.z)).toBe(false);
    }
    expect(fenceSlots('plane')).toHaveLength(0);
    expect(fenceSlots('link').length).toBeGreaterThan(fenceSlots('sparse').length);
    for (const lamp of LAMP_SPOTS) expect(inPlayVolume(lamp.x, lamp.z)).toBe(false);
    expect(LAMP_SPOTS.filter((lamp) => lamp.x < 0).length).toBeGreaterThan(1);
  });
});
