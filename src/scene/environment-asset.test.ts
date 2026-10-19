// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ENVIRONMENT_LOD, ENVIRONMENT_SCALE, ENVIRONMENT_OFFSET_Z, ENVIRONMENT_OFFSET_X, ENVIRONMENT_OFFSET_Y } from './environment';

function asset(file: string) {
  const buf = readFileSync(new URL(`../../public/models/environment/${file}.glb`, import.meta.url));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const view = new DataView(ab);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(buf.length);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 20, view.getUint32(12, true))));
  return { json, bytes: buf.length };
}

describe('decorative environment safety and delivery budgets', () => {
  it('ships each selected quality with strictly falling triangle and byte budgets', () => {
    let lastTriangles = Infinity, lastBytes = Infinity;
    for (const quality of ['high', 'medium', 'low'] as const) {
      const { json: g, bytes } = asset(`hillside-lod${ENVIRONMENT_LOD[quality]}`);
      const primitive = g.meshes[0].primitives[0];
      const triangles = g.accessors[primitive.indices].count / 3;
      expect(triangles).toBeLessThan(lastTriangles);
      expect(bytes).toBeLessThan(lastBytes);
      expect(triangles).toBeLessThan(40_000);
      expect(bytes).toBeLessThan(3_500_000);
      const position = g.accessors[primitive.attributes.POSITION];
      // Behind the wall and side-wall ends; no decorative triangle enters play.
      expect(position.max[2]).toBeLessThan(-4.4);
      expect(position.max[2] * ENVIRONMENT_SCALE + ENVIRONMENT_OFFSET_Z).toBeLessThan(-4.4);
      expect(Number.isFinite(ENVIRONMENT_OFFSET_X)).toBe(true);
      expect(Number.isFinite(ENVIRONMENT_OFFSET_Y)).toBe(true);
      expect(g.animations).toBeUndefined();
      expect(g.skins).toBeUndefined();
      expect(g.extensionsRequired).toBeUndefined();
      expect(g.meshes).toHaveLength(1);
      expect(g.meshes[0].primitives).toHaveLength(1);
      expect(g.materials).toHaveLength(1);
      expect(g.images[0].mimeType).toBe('image/png');
      expect(g.images[0].uri).toBeUndefined();
      lastTriangles = triangles; lastBytes = bytes;
    }
  });

  it.each(['townhouse-ochre', 'townhouse-coral', 'townhouse-teal', 'corner-mercearia', 'stepped-alley', 'rooftop-equipment', 'street-furniture'])(
    '%s is self-contained, finite and usable at metre scale', (name) => {
      const { json: g } = asset(name);
      expect(g.buffers[0].uri).toBeUndefined();
      expect(g.images[0].bufferView).toBeTypeOf('number');
      const position = g.accessors[g.meshes[0].primitives[0].attributes.POSITION];
      expect(position.min.every(Number.isFinite)).toBe(true);
      expect(position.max.every(Number.isFinite)).toBe(true);
      expect(position.min[1]).toBeGreaterThanOrEqual(-0.001);
      expect(position.max[1]).toBeLessThan(6);
    },
  );
});
