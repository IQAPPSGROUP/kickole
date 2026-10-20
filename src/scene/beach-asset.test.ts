// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { beachCarnivalClearOfPlay } from './beachCarnival';
import { resolveEnvironmentTheme } from './environment';

function asset(file: string) {
  const b=readFileSync(new URL(`../../public/models/beach/${file}.glb`,import.meta.url));
  const ab=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),v=new DataView(ab);
  expect(v.getUint32(0,true)).toBe(0x46546c67);
  expect(v.getUint32(4,true)).toBe(2);expect(v.getUint32(8,true)).toBe(b.length);
  return {g:JSON.parse(new TextDecoder().decode(new Uint8Array(ab,20,v.getUint32(12,true)))),bytes:b.length};
}

describe('beach visual theme',()=>{
  it('keeps carnival cloth behind the rope and in front of the goal',()=>{
    expect(beachCarnivalClearOfPlay()).toBe(true);
  });
  it('preserves street by default and only accepts the explicit beach theme',()=>{
    expect(resolveEnvironmentTheme()).toBe('street');
    expect(resolveEnvironmentTheme('anything')).toBe('street');
    expect(resolveEnvironmentTheme('beach')).toBe('beach');
    expect(resolveEnvironmentTheme('street','beach')).toBe('beach');
    expect(resolveEnvironmentTheme('beach','street')).toBe('street');
  });
  it('keeps all backdrop geometry behind play and within descending mobile budgets',()=>{
    let lastTriangles=Infinity,lastBytes=Infinity;
    for(let i=0;i<3;i++){
      const {g,bytes}=asset(`beach-lod${i}`),p=g.meshes[0].primitives[0];
      const triangles=g.accessors[p.indices].count/3;
      expect(g.accessors[p.attributes.POSITION].max[2]).toBeLessThan(-4.4);
      expect(triangles).toBeLessThan(lastTriangles);expect(bytes).toBeLessThan(lastBytes);
      expect(triangles).toBeLessThan(40_000);expect(bytes).toBeLessThan(3_700_000);
      expect(g.meshes).toHaveLength(1);expect(g.meshes[0].primitives).toHaveLength(1);
      expect(g.materials).toHaveLength(1);expect(g.animations).toBeUndefined();expect(g.skins).toBeUndefined();
      expect(g.extensionsRequired).toBeUndefined();expect(g.images[0].mimeType).toBe('image/png');
      expect(g.images[0].uri).toBeUndefined();lastTriangles=triangles;lastBytes=bytes;
    }
  });
  it.each(['palm-cluster','coconut-kiosk','lifeguard-tower','umbrella-loungers','beach-goal','fishing-boat','boardwalk'])(
    '%s is a self-contained static module at metre scale',(name)=>{
      const {g}=asset(name),p=g.accessors[g.meshes[0].primitives[0].attributes.POSITION];
      expect(g.buffers[0].uri).toBeUndefined();expect(g.images[0].bufferView).toBeTypeOf('number');
      expect(p.min.every(Number.isFinite)).toBe(true);expect(p.max.every(Number.isFinite)).toBe(true);
      expect(p.min[1]).toBeGreaterThanOrEqual(-.1);expect(p.max[1]).toBeLessThan(6);
      expect(g.animations).toBeUndefined();
    },
  );
});
