import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CC0 MakeHuman clothes bound onto the hm08 base.
 * The mhclo file stores barycentric weights and an offset per clothes vertex.
 * A single body index means the clothes vertex sits on that body vertex.
 */
export interface Garment {
  position: number[][];
  uv: number[][];
  faces: { v: number[]; uv: number[] }[];
  hide: Set<number>;
}

function parseHide(text: string): Set<number> {
  const hide = new Set<number>();
  const at = text.indexOf('delete_verts');
  if (at < 0) return hide;
  const body = text.slice(at + 'delete_verts'.length);
  const tokens: string[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    if (/^[A-Za-z_]/.test(trimmed)) break;
    for (const token of trimmed.split(/\s+/)) tokens.push(token);
  }
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '-') continue;
    if (tokens[i + 1] === '-' && tokens[i + 2]) {
      const a = Number(tokens[i]);
      const b = Number(tokens[i + 2]);
      for (let v = a; v <= b; v++) hide.add(v);
      i += 2;
    } else {
      hide.add(Number(tokens[i]));
    }
  }
  return hide;
}

const HEADER = /^(name|obj_file|material|uuid|tag|x_scale|y_scale|z_scale|z_depth|max_pole|author|license|homepage|description)\b/;

function parseBindings(text: string, base: number[][]): number[][] {
  const at = text.indexOf('verts 0');
  if (at < 0) throw new Error('mhclo has no vertex block');
  const positions: number[][] = [];
  for (const line of text.slice(at).split('\n').slice(1)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    // Some official mhclo files place `material` between the verts header and the numbers.
    if (HEADER.test(trimmed)) continue;
    if (/^[A-Za-z_]/.test(trimmed)) break;
    const p = trimmed.split(/\s+/).map(Number);
    if (p.length === 1) {
      const v = base[p[0]];
      if (!v) throw new Error(`mhclo body index ${p[0]} is outside the base`);
      positions.push([v[0], v[1], v[2]]);
    } else if (p.length >= 9) {
      const b1 = base[p[0]];
      const b2 = base[p[1]];
      const b3 = base[p[2]];
      if (!b1 || !b2 || !b3) throw new Error('mhclo body index is outside the base');
      positions.push([
        p[3] * b1[0] + p[4] * b2[0] + p[5] * b3[0] + p[6],
        p[3] * b1[1] + p[4] * b2[1] + p[5] * b3[1] + p[7],
        p[3] * b1[2] + p[4] * b2[2] + p[5] * b3[2] + p[8],
      ]);
    }
  }
  return positions;
}

function parseObj(text: string, vertexCount: number): Pick<Garment, 'uv' | 'faces'> {
  const vt: number[][] = [];
  const faces: { v: number[]; uv: number[] }[] = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('vt ')) {
      const p = line.trim().split(/\s+/);
      vt.push([Number(p[1]), Number(p[2])]);
    } else if (line.startsWith('f ')) {
      const slots = line.trim().split(/\s+/).slice(1);
      const v: number[] = [];
      const uv: number[] = [];
      for (const slot of slots) {
        const [vi, ti] = slot.split('/');
        const vertex = Number(vi) - 1;
        if (vertex < 0 || vertex >= vertexCount) throw new Error(`obj face vertex ${vertex} is outside the clothes mesh`);
        v.push(vertex);
        uv.push(ti ? Number(ti) - 1 : 0);
      }
      faces.push({ v, uv });
    }
  }
  const uv = new Array<number[]>(vertexCount).fill([0.5, 0.5]);
  for (const face of faces) {
    face.v.forEach((vertex, i) => {
      const coord = vt[face.uv[i]];
      if (coord) uv[vertex] = coord;
    });
  }
  return { uv, faces };
}

export function loadGarment(dir: string, objName: string, mhcloName: string, base: number[][]): Garment {
  const obj = readFileSync(join(dir, objName), 'utf8');
  const mhclo = readFileSync(join(dir, mhcloName), 'utf8');
  const position = parseBindings(mhclo, base);
  const { uv, faces } = parseObj(obj, position.length);
  if (faces.length === 0) throw new Error(`${objName} has no faces`);
  return { position, uv, faces, hide: parseHide(mhclo) };
}
