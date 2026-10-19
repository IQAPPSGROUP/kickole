/**
 * Build the realistic contract footballer from the CC0 MakeHuman hm08 base.
 *
 * Source: tools/realistic/sources/makehuman-hm08-base.obj (CC0, September 2020).
 * The naked base is scaled to about 1.82 m, arms are dropped into a relaxed A-pose,
 * and a street kit (shirt, shorts, socks, boots) is modelled over the body.
 * Male and female share the contract skeleton. Each uses its own CC0 macro
 * target, jersey and hair; socks, boots and clips stay on the same bone names.
 * Run: npm run build:player
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Material, Node as GltfNode } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { GameEngine } from '../src/engine/engine.ts';
import type { Side } from '../src/engine/config.ts';
import { computePose, type Pose } from '../src/scene/pose.ts';
import { loadGarment, type Garment } from './realistic/garments.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OBJ = join(ROOT, 'realistic/sources/makehuman-hm08-base.obj');
const TARGETS = join(ROOT, 'realistic/sources/targets');
const TOKTX = process.env.TOKTX ?? '/tmp/ktx/KTX-Software-4.4.0-Linux-x86_64/bin/toktx';

const TARGET_HEIGHT = 1.82;
const GROUPS = new Set([
  'body',
  'helper-l-eye', 'helper-r-eye',
  'helper-upper-teeth', 'helper-lower-teeth',
]);
const CLOTHES = join(ROOT, 'realistic/sources/clothes');

interface TargetSpec { file: string; weight: number }
interface BodyRecipe {
  id: 'male' | 'female';
  targets: TargetSpec[];
  shirt: [string, string];
  shorts: [string, string];
  hair: [string, string];
  subdiv: Record<string, number>;
  /** Drop loose cuffs onto the forearm. Tuned per jersey. */
  sleeveDrop: number;
  out0: string;
  out1: string;
}

/** Athletic, not a bodybuilder: full young gender target plus a partial muscle corner. */
const RECIPES: BodyRecipe[] = [
  {
    id: 'male',
    targets: [
      { file: 'caucasian-male-young.target', weight: 1 },
      { file: 'universal-male-young-maxmuscle-averageweight.target', weight: 0.45 },
    ],
    shirt: ['crude_male_shirt.obj', 'crude_male_shirt.mhclo'],
    shorts: ['jean_shorts.obj', 'jean_shorts.mhclo'],
    hair: ['hair_short.obj', 'hair_short.mhclo'],
    subdiv: { Shirt: 1, Shirt_Trim: 1, Shorts: 1, Boots: 1, Boots_Sole: 1, Socks: 1, Hair: 1 },
    sleeveDrop: 0.03,
    out0: join(ROOT, '../public/models/kickole_player_v4.glb'),
    out1: join(ROOT, '../public/models/kickole_player_v4_lod1.glb'),
  },
  {
    id: 'female',
    targets: [
      { file: 'caucasian-female-young.target', weight: 1 },
      { file: 'universal-female-young-maxmuscle-averageweight.target', weight: 0.35 },
    ],
    shirt: ['crude_female_tshirt.obj', 'crude_female_tshirt.mhclo'],
    shorts: ['jean_shorts.obj', 'jean_shorts.mhclo'],
    hair: ['ponytail01.obj', 'ponytail01.mhclo'],
    subdiv: { Shirt: 1, Shirt_Trim: 1, Shorts: 1, Boots: 1, Boots_Sole: 1, Socks: 1, Hair: 0 },
    sleeveDrop: 0.012,
    out0: join(ROOT, '../public/models/kickole_player_v4_female.glb'),
    out1: join(ROOT, '../public/models/kickole_player_v4_female_lod1.glb'),
  },
];

function applyTargets(verts: number[][], targets: TargetSpec[]) {
  for (const target of targets) {
    const text = readFileSync(join(TARGETS, target.file), 'utf8');
    for (const line of text.split('\n')) {
      if (!line || line.startsWith('#')) continue;
      const p = line.trim().split(/\s+/);
      if (p.length < 4) continue;
      const v = verts[Number(p[0])];
      if (!v) continue;
      v[0] += Number(p[1]) * target.weight;
      v[1] += Number(p[2]) * target.weight;
      v[2] += Number(p[3]) * target.weight;
    }
  }
}

type V3 = Vector3;

interface Seg {
  name: string;
  srcA: V3; srcB: V3;
  dstA: V3; dstB: V3;
  parent: string | null;
}

interface Corner {
  p: V3;
  j: number[];
  w: number[];
  uv: [number, number];
  color: [number, number, number];
}

interface Prim {
  name: string;
  pos: number[];
  nrm: number[];
  uv: number[];
  col: number[];
  joints: number[];
  weights: number[];
  idx: number[];
}

const JOINT_ORDER = [
  'Root', 'Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'UpperArm_L', 'LowerArm_L', 'Hand_L',
  'UpperArm_R', 'LowerArm_R', 'Hand_R',
  'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'Toe_L',
  'UpperLeg_R', 'LowerLeg_R', 'Foot_R', 'Toe_R',
] as const;

function parseObj(text: string) {
  const v: number[][] = [];
  const groups = new Map<string, number[][]>();
  let g = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const p = line.trim().split(/\s+/);
      v.push([Number(p[1]), Number(p[2]), Number(p[3])]);
    } else if (line.startsWith('g ')) {
      g = line.slice(2).trim();
      if (!groups.has(g)) groups.set(g, []);
    } else if (line.startsWith('f ') && g) {
      const corners = line.trim().split(/\s+/).slice(1).map((slot) => Number(slot.split('/')[0]) - 1);
      groups.get(g)!.push(corners);
    }
  }
  return { v, groups };
}

function centroid(v: number[][], faces: number[][] | undefined): V3 {
  if (!faces?.length) throw new Error('missing joint group');
  const acc = new Vector3();
  let n = 0;
  for (const face of faces) for (const i of face) {
    acc.x += v[i][0]; acc.y += v[i][1]; acc.z += v[i][2];
    n++;
  }
  return acc.multiplyScalar(1 / n);
}

function distToSeg(p: V3, a: V3, b: V3): number {
  const ab = b.clone().sub(a);
  const len2 = ab.lengthSq() || 1e-8;
  const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / len2));
  return p.distanceTo(a.clone().addScaledVector(ab, t));
}

function blendWeights(p: V3, segs: Seg[], space: 'src' | 'dst'): { j: number[]; w: number[] } {
  const scored = segs.map((s, i) => ({ i, d: distToSeg(p, space === 'src' ? s.srcA : s.dstA, space === 'src' ? s.srcB : s.dstB) }));
  scored.sort((a, b) => a.d - b.d);
  const a = scored[0];
  const b = scored[1];
  const band = 0.045;
  const t = Math.min(1, Math.max(0, ((b?.d ?? 1) - a.d) / band));
  const w0 = 0.5 + 0.5 * t;
  const j = [a.i, b?.i ?? a.i, 0, 0];
  const w = [w0, 1 - w0, 0, 0];
  if (w[1] < 0.04) { w[0] = 1; w[1] = 0; j[1] = 0; }
  return { j, w };
}

function warpPoint(p: V3, segs: Seg[]): V3 {
  const { j, w } = blendWeights(p, segs, 'src');
  const out = new Vector3();
  for (let k = 0; k < 2; k++) {
    if (w[k] <= 0) continue;
    const s = segs[j[k]];
    const srcDir = s.srcB.clone().sub(s.srcA);
    const dstDir = s.dstB.clone().sub(s.dstA);
    const srcLen = srcDir.length() || 1;
    const dstLen = dstDir.length() || 1;
    srcDir.multiplyScalar(1 / srcLen);
    dstDir.multiplyScalar(1 / dstLen);
    const q = new Quaternion().setFromUnitVectors(srcDir, dstDir);
    const off = p.clone().sub(s.srcA);
    const along = off.dot(srcDir);
    const perp = off.addScaledVector(srcDir, -along);
    const moved = s.dstA.clone().addScaledVector(dstDir, along * (dstLen / srcLen)).add(perp.applyQuaternion(q));
    out.addScaledVector(moved, w[k]);
  }
  return out;
}

function skinOf(p: V3, segs: Seg[], headOnly = false): { j: number[]; w: number[] } {
  if (headOnly) {
    const head = segs.findIndex((s) => s.name === 'Head');
    return { j: [head, 0, 0, 0], w: [1, 0, 0, 0] };
  }
  const { j, w } = blendWeights(p, segs, 'dst');
  // Renormalise into 4 slots. Bone index here is the segment index; remapped later.
  return { j, w };
}

function faceNormal(a: V3, b: V3, c: V3): V3 {
  return b.clone().sub(a).cross(c.clone().sub(a)).normalize();
}

function smoothNormals(prims: Prim[]) {
  const buckets = new Map<string, { n: V3; refs: { prim: Prim; v: number }[] }>();
  for (const prim of prims) {
    const count = prim.pos.length / 3;
    prim.nrm = new Array(prim.pos.length).fill(0);
    for (let t = 0; t < prim.idx.length; t += 3) {
      const ia = prim.idx[t], ib = prim.idx[t + 1], ic = prim.idx[t + 2];
      const a = new Vector3(prim.pos[ia * 3], prim.pos[ia * 3 + 1], prim.pos[ia * 3 + 2]);
      const b = new Vector3(prim.pos[ib * 3], prim.pos[ib * 3 + 1], prim.pos[ib * 3 + 2]);
      const c = new Vector3(prim.pos[ic * 3], prim.pos[ic * 3 + 1], prim.pos[ic * 3 + 2]);
      const fn = faceNormal(a, b, c);
      if (!Number.isFinite(fn.x)) continue;
      for (const i of [ia, ib, ic]) {
        const key = `${prim.pos[i * 3].toFixed(4)},${prim.pos[i * 3 + 1].toFixed(4)},${prim.pos[i * 3 + 2].toFixed(4)},${prim.name}`;
        let bucket = buckets.get(key);
        if (!bucket) { bucket = { n: new Vector3(), refs: [] }; buckets.set(key, bucket); }
        bucket.n.add(fn);
        bucket.refs.push({ prim, v: i });
      }
    }
    void count;
  }
  for (const bucket of buckets.values()) {
    if (bucket.n.lengthSq() < 1e-10) bucket.n.set(0, 1, 0);
    else bucket.n.normalize();
    for (const ref of bucket.refs) {
      ref.prim.nrm[ref.v * 3] = bucket.n.x;
      ref.prim.nrm[ref.v * 3 + 1] = bucket.n.y;
      ref.prim.nrm[ref.v * 3 + 2] = bucket.n.z;
    }
  }
}

function tangents(prim: Prim): Float32Array {
  const count = prim.pos.length / 3;
  const tan1 = new Float32Array(count * 3);
  for (let t = 0; t < prim.idx.length; t += 3) {
    const ia = prim.idx[t], ib = prim.idx[t + 1], ic = prim.idx[t + 2];
    const ax = prim.pos[ia * 3], ay = prim.pos[ia * 3 + 1], az = prim.pos[ia * 3 + 2];
    const bx = prim.pos[ib * 3], by = prim.pos[ib * 3 + 1], bz = prim.pos[ib * 3 + 2];
    const cx = prim.pos[ic * 3], cy = prim.pos[ic * 3 + 1], cz = prim.pos[ic * 3 + 2];
    const au = prim.uv[ia * 2], av = prim.uv[ia * 2 + 1];
    const bu = prim.uv[ib * 2], bv = prim.uv[ib * 2 + 1];
    const cu = prim.uv[ic * 2], cv = prim.uv[ic * 2 + 1];
    const x1 = bx - ax, y1 = by - ay, z1 = bz - az;
    const x2 = cx - ax, y2 = cy - ay, z2 = cz - az;
    const s1 = bu - au, s2 = cu - au, t1 = bv - av, t2 = cv - av;
    const denom = s1 * t2 - s2 * t1;
    const r = Math.abs(denom) < 1e-8 ? 0 : 1 / denom;
    const tx = (t2 * x1 - t1 * x2) * r;
    const ty = (t2 * y1 - t1 * y2) * r;
    const tz = (t2 * z1 - t1 * z2) * r;
    for (const i of [ia, ib, ic]) {
      tan1[i * 3] += tx; tan1[i * 3 + 1] += ty; tan1[i * 3 + 2] += tz;
    }
  }
  const out = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const nx = prim.nrm[i * 3], ny = prim.nrm[i * 3 + 1], nz = prim.nrm[i * 3 + 2];
    let tx = tan1[i * 3], ty = tan1[i * 3 + 1], tz = tan1[i * 3 + 2];
    const dot = nx * tx + ny * ty + nz * tz;
    tx -= nx * dot; ty -= ny * dot; tz -= nz * dot;
    const len = Math.hypot(tx, ty, tz) || 1;
    out[i * 4] = tx / len; out[i * 4 + 1] = ty / len; out[i * 4 + 2] = tz / len; out[i * 4 + 3] = 1;
  }
  return out;
}

function emptyPrim(name: string): Prim {
  return { name, pos: [], nrm: [], uv: [], col: [], joints: [], weights: [], idx: [] };
}

function pushVert(prim: Prim, c: Corner, normal: V3): number {
  const i = prim.pos.length / 3;
  prim.pos.push(c.p.x, c.p.y, c.p.z);
  prim.nrm.push(normal.x, normal.y, normal.z);
  prim.uv.push(c.uv[0], c.uv[1]);
  prim.col.push(c.color[0], c.color[1], c.color[2]);
  for (let k = 0; k < 4; k++) {
    prim.joints.push(c.j[k] ?? 0);
    prim.weights.push(c.w[k] ?? 0);
  }
  return i;
}

function emitTri(prim: Prim, a: Corner, b: Corner, c: Corner) {
  const n = faceNormal(a.p, b.p, c.p);
  if (!Number.isFinite(n.x)) return;
  prim.idx.push(pushVert(prim, a, n), pushVert(prim, b, n), pushVert(prim, c, n));
}

function midCorner(a: Corner, b: Corner): Corner {
  const w = [0, 0, 0, 0];
  const acc = new Map<number, number>();
  for (let k = 0; k < 4; k++) {
    acc.set(a.j[k], (acc.get(a.j[k]) ?? 0) + a.w[k] * 0.5);
    acc.set(b.j[k], (acc.get(b.j[k]) ?? 0) + b.w[k] * 0.5);
  }
  const ranked = [...acc.entries()].filter(([, weight]) => weight > 0.02).sort((p, q) => q[1] - p[1]).slice(0, 4);
  const sum = ranked.reduce((s, e) => s + e[1], 0) || 1;
  const j = [0, 0, 0, 0];
  ranked.forEach((e, i) => { j[i] = e[0]; w[i] = e[1] / sum; });
  return {
    p: a.p.clone().add(b.p).multiplyScalar(0.5),
    j, w,
    uv: [(a.uv[0] + b.uv[0]) / 2, (a.uv[1] + b.uv[1]) / 2],
    color: [(a.color[0] + b.color[0]) / 2, (a.color[1] + b.color[1]) / 2, (a.color[2] + b.color[2]) / 2],
  };
}

function emitQuad(prim: Prim, a: Corner, b: Corner, c: Corner, d: Corner, sub: boolean) {
  if (!sub) { emitTri(prim, a, b, c); emitTri(prim, a, c, d); return; }
  const ab = midCorner(a, b), bc = midCorner(b, c), cd = midCorner(c, d), da = midCorner(d, a), m = midCorner(ab, cd);
  emitQuad(prim, a, ab, m, da, false);
  emitQuad(prim, ab, b, bc, m, false);
  emitQuad(prim, m, bc, c, cd, false);
  emitQuad(prim, da, m, cd, d, false);
}

function skinUv(p: V3): [number, number] {
  return [Math.min(0.82, Math.max(0, p.x * 1.4 + 0.4)), Math.min(0.98, Math.max(0.02, p.y * 0.42))];
}

function subdividePrim(prim: Prim): Prim {
  const out = emptyPrim(prim.name);
  out.pos = prim.pos.slice();
  out.nrm = prim.nrm.slice();
  out.uv = prim.uv.slice();
  out.col = prim.col.slice();
  out.joints = prim.joints.slice();
  out.weights = prim.weights.slice();
  const mid = new Map<string, number>();
  const midpoint = (a: number, b: number) => {
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    const found = mid.get(key);
    if (found !== undefined) return found;
    const i = out.pos.length / 3;
    for (let k = 0; k < 3; k++) {
      out.pos.push((prim.pos[a * 3 + k] + prim.pos[b * 3 + k]) / 2);
      out.nrm.push((prim.nrm[a * 3 + k] + prim.nrm[b * 3 + k]) / 2);
      out.col.push((prim.col[a * 3 + k] + prim.col[b * 3 + k]) / 2);
    }
    for (let k = 0; k < 2; k++) out.uv.push((prim.uv[a * 2 + k] + prim.uv[b * 2 + k]) / 2);
    const acc = new Map<number, number>();
    for (const v of [a, b]) for (let k = 0; k < 4; k++) {
      const joint = prim.joints[v * 4 + k];
      acc.set(joint, (acc.get(joint) ?? 0) + prim.weights[v * 4 + k] * 0.5);
    }
    const ranked = [...acc.entries()].filter(([, weight]) => weight > 0.02).sort((p, q) => q[1] - p[1]).slice(0, 4);
    const sum = ranked.reduce((s, entry) => s + entry[1], 0) || 1;
    const joints = [0, 0, 0, 0];
    const weights = [0, 0, 0, 0];
    ranked.forEach((entry, n) => { joints[n] = entry[0]; weights[n] = entry[1] / sum; });
    out.joints.push(...joints);
    out.weights.push(...weights);
    mid.set(key, i);
    return i;
  };
  for (let t = 0; t < prim.idx.length; t += 3) {
    const a = prim.idx[t], b = prim.idx[t + 1], c = prim.idx[t + 2];
    const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
    out.idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }
  return out;
}

interface Built {
  prims: Prim[];
  segs: Seg[];
  jointIndex: Map<string, number>;
  bones: Map<string, Group>;
  scene: Group;
  toeRest: { left: V3; right: V3 };
}

function buildMesh(recipe: BodyRecipe): Built {
  const source = parseObj(readFileSync(OBJ, 'utf8'));
  const verts = source.v.map((p) => [p[0], p[1], p[2]]);
  applyTargets(verts, recipe.targets);
  const parsed = { v: verts, groups: source.groups };
  let minY = Infinity, maxY = -Infinity;
  for (const p of parsed.v) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  const scale = TARGET_HEIGHT / (maxY - minY);
  const points = parsed.v.map((p) => new Vector3(p[0] * scale, (p[1] - minY) * scale, p[2] * scale));
  const C = (name: string) => centroid(points.map((p) => [p.x, p.y, p.z]), parsed.groups.get(name));

  const pelvis = C('joint-pelvis');
  const chest = C('joint-spine-1');
  const spineLow = C('joint-spine-3');
  const neck = C('joint-neck');
  const head = C('joint-head');
  const headTop = C('joint-head-2');
  const mouth = C('joint-mouth');

  const src = {
    shL: C('joint-r-shoulder'), elL: C('joint-r-elbow'), wrL: C('joint-r-hand'),
    shR: C('joint-l-shoulder'), elR: C('joint-l-elbow'), wrR: C('joint-l-hand'),
    hipL: C('joint-r-upper-leg'), knL: C('joint-r-knee'), anL: C('joint-r-ankle'), toeL: C('joint-r-foot-2'),
    hipR: C('joint-l-upper-leg'), knR: C('joint-l-knee'), anR: C('joint-l-ankle'), toeR: C('joint-l-foot-2'),
  };

  const dropArm = (sh: V3, el: V3, wr: V3) => {
    const upper = sh.distanceTo(el);
    const fore = el.distanceTo(wr);
    const elbow = new Vector3(sh.x, sh.y - upper * 0.985, sh.z + 0.015);
    const wrist = new Vector3(sh.x, elbow.y - fore * 0.985, elbow.z + 0.02);
    return { elbow, wrist };
  };
  const armL = dropArm(src.shL, src.elL, src.wrL);
  const armR = dropArm(src.shR, src.elR, src.wrR);
  const dropLeg = (hip: V3, knee: V3, ankle: V3, toe: V3) => {
    const thigh = hip.distanceTo(knee);
    const shin = knee.distanceTo(ankle);
    const kn = new Vector3(hip.x * 0.9, hip.y - thigh * 0.99, hip.z + 0.02);
    const an = new Vector3(hip.x * 0.82, kn.y - shin * 0.99, kn.z - 0.005);
    const delta = toe.clone().sub(ankle);
    const to = new Vector3(an.x + delta.x * 0.15, an.y + Math.min(delta.y, -0.015), an.z + Math.hypot(delta.x, delta.z));
    return { kn, an, to };
  };
  const legL = dropLeg(src.hipL, src.knL, src.anL, src.toeL);
  const legR = dropLeg(src.hipR, src.knR, src.anR, src.toeR);

  const seg = (name: string, srcA: V3, srcB: V3, dstA: V3, dstB: V3, parent: string | null): Seg => ({ name, srcA, srcB, dstA, dstB, parent });
  const segs: Seg[] = [
    seg('Hips', pelvis, spineLow, pelvis.clone(), spineLow.clone(), 'Root'),
    seg('Spine', spineLow, chest, spineLow.clone(), chest.clone(), 'Hips'),
    seg('Spine2', chest, neck, chest.clone(), neck.clone(), 'Spine'),
    seg('Neck', neck, head, neck.clone(), head.clone(), 'Spine2'),
    seg('Head', head, headTop, head.clone(), headTop.clone(), 'Neck'),
    seg('UpperArm_L', src.shL, src.elL, src.shL.clone(), armL.elbow, 'Spine2'),
    seg('LowerArm_L', src.elL, src.wrL, armL.elbow.clone(), armL.wrist, 'UpperArm_L'),
    seg('Hand_L', src.wrL, src.wrL.clone().add(new Vector3(0, -0.08, 0.02)), armL.wrist.clone(), armL.wrist.clone().add(new Vector3(0, -0.09, 0.02)), 'LowerArm_L'),
    seg('UpperArm_R', src.shR, src.elR, src.shR.clone(), armR.elbow, 'Spine2'),
    seg('LowerArm_R', src.elR, src.wrR, armR.elbow.clone(), armR.wrist, 'UpperArm_R'),
    seg('Hand_R', src.wrR, src.wrR.clone().add(new Vector3(0, -0.08, 0.02)), armR.wrist.clone(), armR.wrist.clone().add(new Vector3(0, -0.09, 0.02)), 'LowerArm_R'),
    seg('UpperLeg_L', src.hipL, src.knL, src.hipL.clone(), legL.kn, 'Hips'),
    seg('LowerLeg_L', src.knL, src.anL, legL.kn.clone(), legL.an, 'UpperLeg_L'),
    seg('Foot_L', src.anL, src.toeL, legL.an.clone(), legL.to, 'LowerLeg_L'),
    seg('UpperLeg_R', src.hipR, src.knR, src.hipR.clone(), legR.kn, 'Hips'),
    seg('LowerLeg_R', src.knR, src.anR, legR.kn.clone(), legR.an, 'UpperLeg_R'),
    seg('Foot_R', src.anR, src.toeR, legR.an.clone(), legR.to, 'LowerLeg_R'),
  ];

  const used = new Set<number>();
  for (const name of GROUPS) for (const face of parsed.groups.get(name) ?? []) for (const i of face) used.add(i);
  const warped = points.map((p, i) => used.has(i) ? warpPoint(p, segs) : p);
  let floor = Infinity;
  for (const i of used) floor = Math.min(floor, warped[i].y);
  for (const p of warped) p.y -= floor;
  for (const s of segs) { s.dstA.y -= floor; s.dstB.y -= floor; }

  const byName = new Map(segs.map((s) => [s.name, s]));
  const world = new Map<string, V3>();
  world.set('Root', new Vector3());
  const place = (name: string) => {
    if (world.has(name)) return world.get(name)!;
    const s = byName.get(name)!;
    world.set(name, s.dstA.clone());
    return s.dstA;
  };
  for (const s of segs) place(s.name);
  // Toe markers sit behind the eventual boot tip. Filled after the boot mesh exists.
  world.set('Toe_L', byName.get('Foot_L')!.dstB.clone());
  world.set('Toe_R', byName.get('Foot_R')!.dstB.clone());

  const segIndex = new Map(segs.map((s, i) => [s.name, i]));
  const remapJoint = (local: number[]): number[] => local.map((i) => {
    const name = segs[i]?.name ?? 'Hips';
    return JOINT_ORDER.indexOf(name as typeof JOINT_ORDER[number]);
  });

  const cornerAt = (vi: number, uv: [number, number], color: [number, number, number], headOnly = false): Corner => {
    const p = warped[vi].clone();
    const skin = skinOf(p, segs, headOnly);
    return { p, j: remapJoint(skin.j), w: skin.w, uv, color };
  };

  const prims = new Map<string, Prim>();
  const prim = (name: string) => {
    let p = prims.get(name);
    if (!p) { p = emptyPrim(name); prims.set(name, p); }
    return p;
  };

  const bodyFaces = parsed.groups.get('body') ?? [];
  const shirtG = loadGarment(CLOTHES, recipe.shirt[0], recipe.shirt[1], parsed.v);
  const shortsG = loadGarment(CLOTHES, recipe.shorts[0], recipe.shorts[1], parsed.v);
  const socksG = loadGarment(CLOTHES, 'socks.obj', 'socks.mhclo', parsed.v);
  const shoesG = loadGarment(CLOTHES, 'sr_shoes_01.obj', 'sr_shoes_01.mhclo', parsed.v);
  const hairG = loadGarment(CLOTHES, recipe.hair[0], recipe.hair[1], parsed.v);
  const hide = new Set<number>([...shirtG.hide, ...shortsG.hide, ...shoesG.hide]);
  const mouthW = mouth.clone();
  mouthW.y -= floor;
  const toWorld = (raw: number[]) => {
    const scaled = new Vector3(raw[0] * scale, (raw[1] - minY) * scale, raw[2] * scale);
    const p = warpPoint(scaled, segs);
    p.y -= floor;
    return p;
  };
  const cover = [shirtG, shortsG, socksG, shoesG].flatMap((garment) => garment.position.map(toWorld));
  const cell = 0.05;
  const buckets = new Map<string, V3[]>();
  for (const point of cover) {
    const key = `${Math.floor(point.x / cell)}:${Math.floor(point.y / cell)}:${Math.floor(point.z / cell)}`;
    const list = buckets.get(key);
    if (list) list.push(point);
    else buckets.set(key, [point]);
  }
  const covered = (p: V3) => {
    const cx = Math.floor(p.x / cell);
    const cy = Math.floor(p.y / cell);
    const cz = Math.floor(p.z / cell);
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const list = buckets.get(`${cx + x}:${cy + y}:${cz + z}`);
      if (!list) continue;
      for (const q of list) {
        if (p.distanceToSquared(q) < 0.018 * 0.018) return true;
      }
    }
    return false;
  };
  for (const i of used) {
    const p = warped[i];
    if (p.y > 1.5) continue;
    if (covered(p)) hide.add(i);
  }

  for (const face of bodyFaces) {
    if (face.some((i) => hide.has(i))) continue;
    const corners = face.map((i) => {
      const corner = cornerAt(i, skinUv(warped[i]), [1, 0.98, 0.96]);
      const lip = corner.p.distanceTo(mouthW);
      if (lip < 0.02 && corner.p.z > mouthW.z) corner.color = [0.84, 0.52, 0.48];
      return corner;
    });
    if (corners.length === 4) emitQuad(prim('Skin'), corners[0], corners[1], corners[2], corners[3], false);
    else if (corners.length === 3) emitTri(prim('Skin'), corners[0], corners[1], corners[2]);
  }

  const white: [number, number, number] = [1, 1, 1];
  const headJoint = JOINT_ORDER.indexOf('Head');
  const emitGarment = (garment: Garment, material: string, headOnly: boolean) => {
    const world = garment.position.map(toWorld);
    const mesh = prim(material);
    const cache = new Map<string, number>();
    const idOf = (vi: number, uvi: number) => {
      const coord = garment.uv[uvi] ?? garment.uv[vi] ?? [0.5, 0.5];
      const key = `${vi}:${coord[0].toFixed(5)}:${coord[1].toFixed(5)}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const p = world[vi];
      const skin = headOnly
        ? { j: [headJoint, 0, 0, 0], w: [1, 0, 0, 0] }
        : (() => { const s = skinOf(p, segs, false); return { j: remapJoint(s.j), w: s.w }; })();
      const index = pushVert(mesh, { p, j: skin.j, w: skin.w, uv: [coord[0], coord[1]], color: white }, new Vector3(0, 1, 0));
      cache.set(key, index);
      return index;
    };
    for (const face of garment.faces) {
      const ids = face.v.map((vi, k) => idOf(vi, face.uv[k] ?? vi));
      if (ids.length === 3) mesh.idx.push(ids[0], ids[1], ids[2]);
      else if (ids.length === 4) mesh.idx.push(ids[0], ids[1], ids[2], ids[0], ids[2], ids[3]);
    }
  };
  emitGarment(shirtG, 'Shirt', false);
  emitGarment(shortsG, 'Shorts', false);
  emitGarment(socksG, 'Socks', false);
  emitGarment(shoesG, 'Boots', false);
  emitGarment(hairG, 'Hair', true);

  const moveFaces = (sourceName: string, destName: string, take: (ia: number, ib: number, ic: number, src: Prim) => boolean) => {
    const src = prims.get(sourceName);
    if (!src || src.idx.length === 0) return;
    const dest = prim(destName);
    const keep: number[] = [];
    const copy = (i: number) => {
      const n = dest.pos.length / 3;
      dest.pos.push(src.pos[i * 3], src.pos[i * 3 + 1], src.pos[i * 3 + 2]);
      dest.nrm.push(src.nrm[i * 3], src.nrm[i * 3 + 1], src.nrm[i * 3 + 2]);
      dest.uv.push(src.uv[i * 2], src.uv[i * 2 + 1]);
      dest.col.push(src.col[i * 3], src.col[i * 3 + 1], src.col[i * 3 + 2]);
      dest.joints.push(src.joints[i * 4], src.joints[i * 4 + 1], src.joints[i * 4 + 2], src.joints[i * 4 + 3]);
      dest.weights.push(src.weights[i * 4], src.weights[i * 4 + 1], src.weights[i * 4 + 2], src.weights[i * 4 + 3]);
      return n;
    };
    for (let t = 0; t < src.idx.length; t += 3) {
      const ia = src.idx[t], ib = src.idx[t + 1], ic = src.idx[t + 2];
      if (take(ia, ib, ic, src)) dest.idx.push(copy(ia), copy(ib), copy(ic));
      else keep.push(ia, ib, ic);
    }
    src.idx = keep;
  };
  const shirtEdges = new Map<string, number>();
  const shirt = prims.get('Shirt');
  if (shirt) {
    for (let t = 0; t < shirt.idx.length; t += 3) {
      const tri = [shirt.idx[t], shirt.idx[t + 1], shirt.idx[t + 2]];
      for (let e = 0; e < 3; e++) {
        const a = tri[e], b = tri[(e + 1) % 3];
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        shirtEdges.set(key, (shirtEdges.get(key) ?? 0) + 1);
      }
    }
  }
  const shirtBoundary = new Set<number>();
  for (const [key, count] of shirtEdges) {
    if (count !== 1) continue;
    const [a, b] = key.split(':').map(Number);
    shirtBoundary.add(a);
    shirtBoundary.add(b);
  }
  moveFaces('Shirt', 'Shirt_Trim', (ia, ib, ic) => {
    const hits = [ia, ib, ic].filter((i) => shirtBoundary.has(i)).length;
    return hits >= 2;
  });
  moveFaces('Boots', 'Boots_Sole', (ia, ib, ic, src) => {
    const n = faceNormal(
      new Vector3(src.pos[ia * 3], src.pos[ia * 3 + 1], src.pos[ia * 3 + 2]),
      new Vector3(src.pos[ib * 3], src.pos[ib * 3 + 1], src.pos[ib * 3 + 2]),
      new Vector3(src.pos[ic * 3], src.pos[ic * 3 + 1], src.pos[ic * 3 + 2]),
    );
    return n.y < -0.45;
  });
  if ((prims.get('Boots_Sole')?.idx.length ?? 0) === 0) {
    const boots = prims.get('Boots');
    if (boots && boots.idx.length >= 3) {
      const sole = prim('Boots_Sole');
      let best = 0;
      let bestY = Infinity;
      for (let t = 0; t < boots.idx.length; t += 3) {
        const y = (boots.pos[boots.idx[t] * 3 + 1] + boots.pos[boots.idx[t + 1] * 3 + 1] + boots.pos[boots.idx[t + 2] * 3 + 1]) / 3;
        if (y < bestY) { bestY = y; best = t; }
      }
      for (let k = 0; k < 3; k++) {
        const i = boots.idx[best + k];
        const n = sole.pos.length / 3;
        sole.pos.push(boots.pos[i * 3], boots.pos[i * 3 + 1] - 0.004, boots.pos[i * 3 + 2]);
        sole.nrm.push(0, -1, 0);
        sole.uv.push(boots.uv[i * 2], boots.uv[i * 2 + 1]);
        sole.col.push(1, 1, 1);
        sole.joints.push(boots.joints[i * 4], boots.joints[i * 4 + 1], boots.joints[i * 4 + 2], boots.joints[i * 4 + 3]);
        sole.weights.push(boots.weights[i * 4], boots.weights[i * 4 + 1], boots.weights[i * 4 + 2], boots.weights[i * 4 + 3]);
        sole.idx.push(n);
      }
    }
  }

  for (const [name, count] of Object.entries(recipe.subdiv)) {
    let mesh = prims.get(name);
    if (!mesh || mesh.idx.length === 0) continue;
    for (let i = 0; i < count; i++) mesh = subdividePrim(mesh);
    prims.set(name, mesh);
  }
  for (const name of ['Shirt', 'Shirt_Trim'] as const) {
    const mesh = prims.get(name);
    if (!mesh) continue;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      const x = mesh.pos[i], y = mesh.pos[i + 1], z = mesh.pos[i + 2];
      const len = Math.hypot(x, z) || 1;
      const torso = Math.abs(x) < 0.16;
      const amp = (torso ? 0.006 : 0.002) * Math.sin(y * 46) + Math.sin(x * 16 + y * 8) * 0.003;
      mesh.pos[i] += (x / len) * amp;
      mesh.pos[i + 2] += (z / len) * amp;
      if (!torso && y < 1.08) mesh.pos[i + 1] -= recipe.sleeveDrop;
    }
  }

  const addHelper = (group: string, material: string, headOnly: boolean, uv: (p: V3, nrm: V3) => [number, number], inflate: number) => {
    for (const face of parsed.groups.get(group) ?? []) {
      const pts = face.map((i) => warped[i]);
      const n = faceNormal(pts[0], pts[1], pts[2]);
      const corners = face.map((i) => {
        const p = warped[i].clone().addScaledVector(n, inflate);
        const skin = skinOf(p, segs, headOnly);
        return { p, j: remapJoint(skin.j), w: skin.w, uv: uv(p, n), color: [1, 1, 1] as [number, number, number] };
      });
      if (corners.length === 4) emitQuad(prim(material), corners[0], corners[1], corners[2], corners[3], false);
      else if (corners.length === 3) emitTri(prim(material), corners[0], corners[1], corners[2]);
    }
  };
  const eyeUv = (p: V3, n: V3): [number, number] => {
    const u = 0.9 + Math.max(-1, Math.min(1, n.x)) * 0.035;
    const v = 0.5 + Math.max(-1, Math.min(1, n.y)) * 0.12;
    return [u, v];
  };
  addHelper('helper-l-eye', 'Skin', true, eyeUv, 0.001);
  addHelper('helper-r-eye', 'Skin', true, eyeUv, 0.001);
  addHelper('helper-upper-teeth', 'Skin', true, () => [0.9, 0.22], 0);
  addHelper('helper-lower-teeth', 'Skin', true, () => [0.9, 0.22], 0);

  const list = [...prims.values()].filter((p) => p.idx.length > 0);
  // Place toe bones 8 cm behind the boot tip so the mesh can meet the ball
  // while the toe joint stays outside the leather.
  for (const side of ['L', 'R'] as const) {
    const boot = list.filter((p) => p.name === 'Boots' || p.name === 'Boots_Sole');
    let tip = -Infinity, tipY = 0, tipX = 0;
    for (const p of boot) for (let i = 0; i < p.pos.length; i += 3) {
      const x = p.pos[i], y = p.pos[i + 1], z = p.pos[i + 2];
      if ((side === 'L' ? x < 0 : x > 0) && z > tip) { tip = z; tipY = y; tipX = x; }
    }
    const ankle = byName.get(`Foot_${side}`)!.dstA;
    world.set(`Toe_${side}`, new Vector3(tipX * 0.85 + ankle.x * 0.15, tipY + 0.035, tip - 0.08));
  }

  let sink = 0;
  for (const prim of list) for (let i = 1; i < prim.pos.length; i += 3) sink = Math.min(sink, prim.pos[i]);
  if (sink < 0) {
    for (const prim of list) for (let i = 1; i < prim.pos.length; i += 3) prim.pos[i] -= sink;
    for (const point of world.values()) point.y -= sink;
  }
  smoothNormals(list);
  const hair = list.find((p) => p.name === 'Hair');
  if (hair) {
    let outward = 0;
    const count = hair.pos.length / 3;
    for (let i = 0; i < count; i++) {
      const x = hair.pos[i * 3], y = hair.pos[i * 3 + 1], z = hair.pos[i * 3 + 2];
      const ox = x, oy = y - (head.y - floor), oz = z - head.z;
      outward += hair.nrm[i * 3] * ox + hair.nrm[i * 3 + 1] * oy + hair.nrm[i * 3 + 2] * oz;
    }
    if (outward < 0) {
      for (let i = 0; i < hair.nrm.length; i++) hair.nrm[i] *= -1;
      for (let t = 0; t < hair.idx.length; t += 3) {
        const tmp = hair.idx[t + 1];
        hair.idx[t + 1] = hair.idx[t + 2];
        hair.idx[t + 2] = tmp;
      }
    }
    for (let i = 0; i < hair.pos.length; i += 3) {
      hair.pos[i] += hair.nrm[i] * 0.006;
      hair.pos[i + 1] += hair.nrm[i + 1] * 0.006;
      hair.pos[i + 2] += hair.nrm[i + 2] * 0.006;
    }
  }
  const { scene, bones } = actuallyBuildRig(world, byName);
  return {
    prims: list,
    segs,
    jointIndex: new Map(JOINT_ORDER.map((n, i) => [n, i])),
    bones,
    scene,
    toeRest: { left: world.get('Toe_L')!, right: world.get('Toe_R')! },
  };
}

function actuallyBuildRig(world: Map<string, V3>, segs: Map<string, Seg>): { scene: Group; bones: Map<string, Group> } {
  const bones = new Map<string, Group>();
  const node = (name: string) => {
    let g = bones.get(name);
    if (!g) {
      g = new Group();
      g.name = name;
      bones.set(name, g);
    }
    return g;
  };
  const scene = node('Scene');
  const root = node('Root');
  scene.add(root);
  const parentOf: Record<string, string> = { Hips: 'Root', Toe_L: 'Foot_L', Toe_R: 'Foot_R' };
  for (const [name, seg] of segs) parentOf[name] = seg.parent ?? 'Root';
  const order = ['Hips', 'Spine', 'Spine2', 'Neck', 'Head', 'UpperArm_L', 'LowerArm_L', 'Hand_L', 'UpperArm_R', 'LowerArm_R', 'Hand_R', 'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'Toe_L', 'UpperLeg_R', 'LowerLeg_R', 'Foot_R', 'Toe_R'];
  for (const name of order) {
    const g = node(name);
    const parentName = parentOf[name];
    const parent = node(parentName);
    parent.add(g);
    const here = world.get(name);
    const there = world.get(parentName) ?? new Vector3();
    if (!here) throw new Error(`missing joint ${name}`);
    g.position.copy(here).sub(there);
    g.quaternion.identity();
  }
  scene.updateMatrixWorld(true);
  return { scene, bones };
}

function resetBind(built: Built) {
  for (const name of JOINT_ORDER) {
    const bone = built.bones.get(name);
    if (!bone) continue;
    bone.quaternion.identity();
    if (name === 'Hips') bone.position.y = bone.userData.restY as number;
  }
  built.scene.updateMatrixWorld(true);
  for (const name of JOINT_ORDER) {
    const bone = built.bones.get(name);
    if (!bone) continue;
    bone.userData.inverse = new Matrix4().copy(bone.matrixWorld).invert();
  }
}

function freshEngine(): GameEngine {
  const engine = new GameEngine();
  engine.phase = 'menu';
  engine.trick = null;
  engine.contact = null;
  engine.selectedTrick = null;
  engine.lastPerfectTime = -10;
  engine.lastDropTime = -10;
  engine.lastKick.left = -10;
  engine.lastKick.right = -10;
  engine.lastContact.left = -10;
  engine.lastContact.right = -10;
  return engine;
}

function contactEngine(side: Side, dt: number): GameEngine {
  const engine = freshEngine();
  engine.phase = 'playing';
  engine.time = 5;
  const sign = side === 'left' ? -1 : 1;
  engine.ball.x = sign * engine.config.footX * 0.6;
  engine.ball.y = engine.config.contactHeight;
  engine.ball.z = engine.config.ballZ;
  engine.ball.vy = -0.2;
  engine.lastKick[side] = engine.time - dt;
  return engine;
}

function followEngine(side: Side, since: number): GameEngine {
  const engine = contactEngine(side, 0.04);
  engine.lastContact[side] = engine.time - since;
  engine.lastKick[side] = engine.lastContact[side] - 0.04;
  return engine;
}

function clonePose(pose: Pose): Pose {
  return { ...pose, legs: { left: { ...pose.legs.left }, right: { ...pose.legs.right } } };
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function smooth(t: number) { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); }

function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = clonePose(a);
  const keys = ['bodyY', 'bodyYaw', 'torsoPitch', 'torsoYaw', 'torsoRoll', 'neckPitch', 'neckYaw', 'headYaw', 'headPitch', 'armLeft', 'armRight', 'armLeftPitch', 'armRightPitch', 'elbowLeft', 'elbowRight'] as const;
  for (const k of keys) out[k] = lerp(a[k], b[k], t);
  for (const side of ['left', 'right'] as const) {
    const from = a.legs[side], to = b.legs[side];
    out.legs[side] = {
      thigh: lerp(from.thigh, to.thigh, t), knee: lerp(from.knee, to.knee, t), abduct: lerp(from.abduct, to.abduct, t),
      twist: lerp(from.twist, to.twist, t), foot: lerp(from.foot, to.foot, t), ankleRoll: lerp(from.ankleRoll, to.ankleRoll, t), ankleYaw: lerp(from.ankleYaw, to.ankleYaw, t),
    };
  }
  return out;
}

function loopingIdle(time: number): Pose {
  const pose = computePose(freshEngine());
  const s1 = Math.sin(time * Math.PI);
  const s2 = Math.sin(time * Math.PI * 2);
  pose.bodyY = s1 * 0.008;
  pose.torsoPitch = 0.02 + s2 * 0.012;
  pose.torsoRoll = s2 * 0.028;
  pose.torsoYaw = s1 * 0.03;
  pose.headYaw = s1 * 0.07;
  pose.headPitch = -0.04 + s2 * 0.02;
  pose.armLeft = 0.22 + s1 * 0.03;
  pose.armRight = 0.22 + Math.sin(time * Math.PI + 0.7) * 0.03;
  pose.legs.left.knee = 0.05;
  pose.legs.right.knee = 0.05;
  return pose;
}

function applyContract(bones: Map<string, Group>, pose: Pose) {
  const set = (name: string, x: number, y: number, z: number) => {
    const b = bones.get(name);
    if (b) b.quaternion.setFromEuler(new Euler(x, y, z, 'XYZ'));
  };
  const hips = bones.get('Hips')!;
  hips.position.y = (hips.userData.restY as number) + pose.bodyY;
  set('Hips', 0, pose.bodyYaw, 0);
  set('Spine', pose.torsoPitch, pose.torsoYaw, pose.torsoRoll);
  set('Neck', pose.neckPitch, pose.neckYaw, 0);
  set('Head', pose.headPitch, pose.headYaw, 0);
  set('UpperArm_L', pose.armLeftPitch, 0, -pose.armLeft);
  set('UpperArm_R', pose.armRightPitch, 0, pose.armRight);
  set('LowerArm_L', pose.elbowLeft, 0, 0);
  set('LowerArm_R', pose.elbowRight, 0, 0);
  const leg = (side: Side, thigh: string, shin: string, foot: string) => {
    const l = pose.legs[side];
    set(thigh, l.thigh, l.twist, l.abduct);
    set(shin, l.knee, 0, 0);
    set(foot, l.foot, l.ankleYaw, l.ankleRoll);
  };
  leg('left', 'UpperLeg_L', 'LowerLeg_L', 'Foot_L');
  leg('right', 'UpperLeg_R', 'LowerLeg_R', 'Foot_R');
  bones.get('Scene')?.updateMatrixWorld(true);
}

interface Nudge { thigh: number; knee: number; foot: number; abduct: number }

function nudgeBoot(pose: Pose, side: Side, amount: number, nudge: Nudge): Pose {
  const leg = pose.legs[side];
  leg.thigh += nudge.thigh * amount;
  leg.knee += nudge.knee * amount;
  leg.foot += nudge.foot * amount;
  leg.abduct += (side === 'left' ? nudge.abduct : -nudge.abduct) * amount;
  return pose;
}

function bootGap(built: Built, pose: Pose, side: Side): { mesh: number; bone: number; footDz: number } {
  applyContract(built.bones, loopingIdle(0));
  const footName = side === 'left' ? 'Foot_L' : 'Foot_R';
  const restZ = built.bones.get(footName)!.getWorldPosition(new Vector3()).z;
  applyContract(built.bones, pose);
  const sign = side === 'left' ? -1 : 1;
  const ball = new Vector3(sign * 0.17 * 0.6, 0.72, 0.62);
  const toe = built.bones.get(side === 'left' ? 'Toe_L' : 'Toe_R')!.getWorldPosition(new Vector3());
  const footZ = built.bones.get(footName)!.getWorldPosition(new Vector3()).z;
  const inv = new Map<string, Matrix4>();
  // Bind inverses were stored on userData.
  let mesh = Infinity;
  let samples = 0;
  for (const prim of built.prims) {
    if (prim.name !== 'Boots' && prim.name !== 'Boots_Sole') continue;
    for (let v = 0; v < prim.pos.length / 3; v++) {
      const p = new Vector3(prim.pos[v * 3], prim.pos[v * 3 + 1], prim.pos[v * 3 + 2]);
      const skinned = new Vector3();
      for (let k = 0; k < 4; k++) {
        const weight = prim.weights[v * 4 + k];
        if (weight <= 0) continue;
        const name = JOINT_ORDER[prim.joints[v * 4 + k]];
        let inverse = inv.get(name);
        if (!inverse) {
          inverse = built.bones.get(name)!.userData.inverse as Matrix4;
          inv.set(name, inverse);
        }
        const world = new Matrix4().multiplyMatrices(built.bones.get(name)!.matrixWorld, inverse);
        skinned.addScaledVector(p.clone().applyMatrix4(world), weight);
      }
      samples++;
      mesh = Math.min(mesh, skinned.distanceTo(ball) - 0.14);
    }
  }
  if (!samples) throw new Error('no boot vertices');
  return { mesh, bone: toe.distanceTo(ball) - 0.14, footDz: footZ - restZ, toeY: toe.y };
}

function scoreNudge(built: Built, nudge: Nudge): number {
  let score = 0;
  for (const side of ['left', 'right'] as const) {
    const pose = nudgeBoot(computePose(contactEngine(side, 0.04)), side, 1, nudge);
    const g = bootGap(built, pose, side);
    const meshMiss = Math.abs(g.mesh - 0.028) * 8;
    const sunk = g.mesh < 0.008 ? (0.008 - g.mesh) * 30 : 0;
    const bone = g.bone < 0.06 ? (0.06 - g.bone) * 8 : g.bone > 0.14 ? (g.bone - 0.14) * 6 : Math.abs(g.bone - 0.09);
    const swing = g.footDz < 0.28 ? 5 : 0;
    // The contract test keeps the toe above the ball's lower hemisphere.
    const lowToe = g.toeY < 0.64 ? (0.64 - g.toeY) * 50 : 0;
    score += meshMiss + sunk + bone + swing + lowToe;
  }
  return score;
}

function chooseNudge(built: Built): Nudge {
  let best: Nudge = { thigh: -0.41, knee: 0.53, foot: -0.05, abduct: 0.1 };
  let bestScore = scoreNudge(built, best);
  const grid = (nudge: Nudge) => {
    const score = scoreNudge(built, nudge);
    if (score < bestScore) { bestScore = score; best = nudge; }
  };
  for (const thigh of [-0.5, -0.41, -0.28, -0.12]) {
    for (const knee of [0.35, 0.53, 0.7]) {
      for (const foot of [-0.2, -0.05, 0.15, 0.32]) {
        for (const abduct of [0, 0.1, 0.18]) grid({ thigh, knee, foot, abduct });
      }
    }
  }
  for (const thigh of [best.thigh - 0.06, best.thigh, best.thigh + 0.06]) {
    for (const knee of [best.knee - 0.08, best.knee, best.knee + 0.08]) {
      for (const foot of [best.foot - 0.08, best.foot, best.foot + 0.08]) {
        grid({ thigh, knee, foot, abduct: best.abduct });
      }
    }
  }
  console.log('boot nudge', best, 'score', +bestScore.toFixed(3));
  return best;
}

function sampleTimes(duration: number, fn: (t: number) => Pose): { times: Float32Array; poses: Pose[] } {
  const frames = Math.max(1, Math.round(duration * 30));
  const times = new Float32Array(frames + 1);
  const poses: Pose[] = [];
  let armL = fn(0).armLeft;
  let armR = fn(0).armRight;
  for (let i = 0; i <= frames; i++) {
    const time = Math.min(duration, i / 30);
    times[i] = time;
    const pose = fn(time);
    // Arms trail the body so the clip eases instead of popping between keys.
    armL += (pose.armLeft - armL) * 0.55;
    armR += (pose.armRight - armR) * 0.55;
    pose.armLeft = armL;
    pose.armRight = armR;
    poses.push(pose);
  }
  return { times, poses };
}

function kickFn(side: Side, nudge: Nudge): (t: number) => Pose {
  const idle = loopingIdle(0);
  const wind = clonePose(idle);
  wind.legs[side].thigh = 0.38;
  wind.legs[side].knee = 0.85;
  wind.legs[side].foot = -0.2;
  wind.torsoPitch = -0.05;
  if (side === 'left') wind.armRight = 0.5; else wind.armLeft = 0.5;
  const contact = nudgeBoot(computePose(contactEngine(side, 0.04)), side, 1, nudge);
  const follow = nudgeBoot(computePose(followEngine(side, 0.18)), side, 0.65, nudge);
  const settle = nudgeBoot(computePose(followEngine(side, 0.42)), side, 0.2, nudge);
  const keys: Array<[number, Pose]> = [[0, idle], [0.14, wind], [0.24, lerpPose(wind, contact, 0.35)], [0.3, contact], [0.42, follow], [0.62, settle], [0.9, idle]];
  return (time: number) => {
    let hi = 1;
    while (hi < keys.length && keys[hi][0] < time) hi++;
    const [t0, p0] = keys[Math.max(0, hi - 1)];
    const [t1, p1] = keys[Math.min(keys.length - 1, hi)];
    const span = t1 - t0;
    const u = span <= 1e-6 ? 1 : smooth((time - t0) / span);
    const pose = span <= 1e-6 ? clonePose(p1) : lerpPose(p0, p1, u);
    if (Math.abs(time - 0.3) < 1 / 60) return clonePose(contact);
    return pose;
  };
}

function missFn(time: number): Pose {
  const engine = freshEngine();
  engine.phase = 'dropped';
  engine.time = time;
  engine.lastDropTime = 0;
  const pose = computePose(engine);
  pose.torsoPitch += smooth(Math.min(1, time / 0.35)) * 0.05;
  return pose;
}

function celebrateFn(time: number): Pose {
  const pose = loopingIdle(0);
  const up = time < 0.24 ? smooth(time / 0.24) : time > 1.0 ? smooth(Math.max(0, (1.2 - time) / 0.2)) : 1;
  const hop = Math.sin(Math.min(time, 1.2) / 1.2 * Math.PI);
  pose.armLeft = lerp(0.22, 2.55, up);
  pose.armRight = lerp(0.22, 2.55, up);
  pose.elbowLeft = 0.4 * up;
  pose.elbowRight = 0.4 * up;
  pose.bodyY = 0.065 * hop;
  pose.headPitch = -0.2 * up;
  pose.torsoPitch = -0.08 * up;
  pose.torsoYaw = Math.sin(time * Math.PI * 2) * 0.05 * up;
  return pose;
}

function noise(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function paintAtlas(size: number, kind: 'skin' | 'cloth' | 'leather'): Buffer {
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    const n = noise(x * 0.37, y * 0.37);
    const n2 = noise(x * 0.08, y * 0.11);
    let r = 220, g = 214, b = 206;
    if (kind === 'skin') {
      r = 214 + n * 16; g = 206 + n * 14; b = 198 + n * 12;
      if (u > 0.86 && v > 0.34 && v < 0.66) {
        const cx = (u - 0.915) / 0.05, cy = (v - 0.5) / 0.13;
        const d = cx * cx + cy * cy;
        if (d < 1) {
          r = 236; g = 236; b = 234;
          const iris = (cx * 0.6) ** 2 + (cy * 0.85) ** 2;
          if (iris < 0.28) { r = 92; g = 62; b = 40; }
          if (iris < 0.07) { r = 20; g = 16; b = 14; }
          if ((cx + 0.08) ** 2 + (cy - 0.08) ** 2 < 0.008) { r = 250; g = 250; b = 250; }
        }
      }
      if (u > 0.86 && v > 0.14 && v < 0.28) { r = 236; g = 232; b = 226; }
    } else if (kind === 'cloth') {
      const weave = ((Math.floor(x / 2) + Math.floor(y / 2)) % 2) ? 4 : 0;
      r = 250 - weave + n2 * 4; g = 250 - weave; b = 250 - weave;
    } else {
      r = 186 + n * 22; g = 176 + n * 18; b = 166 + n * 14;
      const grain = noise(x * 1.7, y * 2.3);
      r -= grain * 18; g -= grain * 16; b -= grain * 12;
    }
    const o = (y * size + x) * 3;
    px[o] = Math.max(0, Math.min(255, r));
    px[o + 1] = Math.max(0, Math.min(255, g));
    px[o + 2] = Math.max(0, Math.min(255, b));
  }
  return px;
}

function paintData(size: number, rough: number, normal: boolean, normalAmp = 10): Buffer {
  const px = Buffer.alloc(size * size * 3);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = noise(x * 0.5, y * 0.5) - 0.5;
    const o = (y * size + x) * 3;
    if (normal) {
      px[o] = 128 + n * normalAmp;
      px[o + 1] = 128 + (noise(x * 0.5 + 4, y * 0.5) - 0.5) * normalAmp;
      px[o + 2] = 255;
    } else {
      px[o] = 235;
      px[o + 1] = Math.max(0, Math.min(255, rough + n * 12));
      px[o + 2] = 0;
    }
  }
  return px;
}

async function ktx(raw: Buffer, size: number, oetf: 'srgb' | 'linear', encode: 'uastc' | 'etc1s', key: string): Promise<Uint8Array> {
  const cacheDir = join(tmpdir(), 'kickole-ktx-cache');
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${key}-${size}-${oetf}-${encode}.ktx2`);
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached));
  const dir = mkdtempSync(join(tmpdir(), 'kickole-ktx-'));
  const png = join(dir, 'in.png');
  const out = join(dir, 'out.ktx2');
  await sharp(raw, { raw: { width: size, height: size, channels: 3 } }).png().toFile(png);
  const args = ['--genmipmap', '--encode', encode, '--assign_oetf', oetf, out, png];
  if (encode === 'uastc') args.splice(3, 0, '--uastc_quality', '1');
  else args.splice(3, 0, '--clevel', '2', '--qlevel', '140');
  execFileSync(TOKTX, args, { stdio: 'pipe' });
  const bytes = new Uint8Array(readFileSync(out));
  writeFileSync(cached, bytes);
  return bytes;
}

function triCount(prims: Prim[]): number {
  return prims.reduce((s, p) => s + p.idx.length / 3, 0);
}

function simplifyPrim(prim: Prim, ratio: number): Prim {
  if (prim.idx.length < 90) return prim;
  const indices = new Uint32Array(prim.idx);
  const positions = new Float32Array(prim.pos);
  const target = Math.max(30, Math.round(indices.length * ratio / 3) * 3);
  let error = 0.05;
  let next = MeshoptSimplifier.simplify(indices, positions, 3, target, error)[0];
  while (next.length > target * 1.08 && error < 0.35) {
    error += 0.05;
    next = MeshoptSimplifier.simplify(indices, positions, 3, target, error)[0];
  }
  if (next.length > target * 1.08) {
    next = MeshoptSimplifier.simplifySloppy(indices, positions, 3, null, target, 0.5)[0];
  }
  console.log('simplify', prim.name, prim.idx.length / 3, '->', next.length / 3, 'target', target / 3);
  const remap = new Map<number, number>();
  const idx: number[] = [];
  for (const old of next) {
    let n = remap.get(old);
    if (n === undefined) { n = remap.size; remap.set(old, n); }
    idx.push(n);
  }
  const order = [...remap.entries()].sort((a, b) => a[1] - b[1]).map(([old]) => old);
  const copy = (src: number[], stride: number) => {
    const out: number[] = [];
    for (const old of order) for (let k = 0; k < stride; k++) out.push(src[old * stride + k]);
    return out;
  };
  return {
    name: prim.name,
    pos: copy(prim.pos, 3),
    nrm: copy(prim.nrm, 3),
    uv: copy(prim.uv, 2),
    col: copy(prim.col, 3),
    joints: copy(prim.joints, 4),
    weights: copy(prim.weights, 4),
    idx,
  };
}

async function writeGlb(built: Built, prims: Prim[], albedo: number, dataSize: number, file: string, clips: { name: string; times: Float32Array; poses: Pose[] }[]) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  resetBind(built);
  const doc = new Document();
  const basis = doc.createExtension(KHRTextureBasisu).setRequired(true);
  void basis;
  const clearExt = doc.createExtension(KHRMaterialsClearcoat);
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Kickole');
  const nodes = new Map<string, GltfNode>();
  const makeNode = (name: string) => {
    const n = doc.createNode(name);
    nodes.set(name, n);
    return n;
  };
  const root = makeNode('Root');
  scene.addChild(root);
  const parentOf = new Map<string, string>([['Hips', 'Root'], ['Toe_L', 'Foot_L'], ['Toe_R', 'Foot_R']]);
  for (const s of built.segs) parentOf.set(s.name, s.parent ?? 'Root');
  for (const name of JOINT_ORDER) {
    if (name === 'Root') continue;
    const node = makeNode(name);
    const parent = nodes.get(parentOf.get(name) ?? 'Root')!;
    parent.addChild(node);
    const bone = built.bones.get(name)!;
    node.setTranslation([bone.position.x, bone.position.y, bone.position.z]);
  }
  const skin = doc.createSkin('Footballer').setSkeleton(root);
  const ibm = new Float32Array(JOINT_ORDER.length * 16);
  JOINT_ORDER.forEach((name, i) => {
    const bone = built.bones.get(name)!;
    const inv = new Matrix4().copy(bone.matrixWorld).invert();
    bone.userData.inverse = inv;
    ibm.set(inv.elements, i * 16);
    skin.addJoint(nodes.get(name)!);
  });
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));

  const images = {
    skin: await ktx(paintAtlas(albedo, 'skin'), albedo, 'srgb', 'uastc', 'skin'),
    skinN: await ktx(paintData(dataSize, 0, true, 16), dataSize, 'linear', 'uastc', 'skinN-v2'),
    skinO: await ktx(paintData(dataSize, 150, false), dataSize, 'linear', 'uastc', 'skinO'),
    cloth: await ktx(paintAtlas(albedo, 'cloth'), albedo, 'srgb', 'etc1s', 'cloth-v2'),
    clothN: await ktx(paintData(dataSize, 0, true, 8), dataSize, 'linear', 'uastc', 'clothN-v2'),
    clothO: await ktx(paintData(dataSize, 190, false), dataSize, 'linear', 'uastc', 'clothO'),
    leather: await ktx(paintAtlas(albedo, 'leather'), albedo, 'srgb', 'etc1s', 'leather'),
    leatherN: await ktx(paintData(dataSize, 0, true, 18), dataSize, 'linear', 'uastc', 'leatherN-v2'),
    leatherO: await ktx(paintData(dataSize, 110, false), dataSize, 'linear', 'uastc', 'leatherO'),
  };
  const tex = (name: string, bytes: Uint8Array) => doc.createTexture(name).setMimeType('image/ktx2').setImage(bytes);
  const skinMap = tex('skin', images.skin);
  const skinN = tex('skinN', images.skinN);
  const skinO = tex('skinO', images.skinO);
  const clothMap = tex('cloth', images.cloth);
  const clothN = tex('clothN', images.clothN);
  const clothO = tex('clothO', images.clothO);
  const leatherMap = tex('leather', images.leather);
  const leatherN = tex('leatherN', images.leatherN);
  const leatherO = tex('leatherO', images.leatherO);

  const mat = (name: string, color: [number, number, number, number], rough: number, maps: { base: typeof skinMap; n: typeof skinN; o: typeof skinO }, clear = 0): Material => {
    const m = doc.createMaterial(name)
      .setBaseColorFactor(color)
      .setRoughnessFactor(rough)
      .setMetallicFactor(0)
      .setBaseColorTexture(maps.base)
      .setNormalTexture(maps.n)
      .setOcclusionTexture(maps.o)
      .setMetallicRoughnessTexture(maps.o);
    if (clear > 0) {
      m.setExtension('KHR_materials_clearcoat', clearExt.createClearcoat().setClearcoatFactor(clear).setClearcoatRoughnessFactor(0.35));
    }
    return m;
  };
  const materials: Record<string, Material> = {
    Skin: mat('Skin', [1, 1, 1, 1], 0.48, { base: skinMap, n: skinN, o: skinO }),
    Hair: mat('Hair', [1, 1, 1, 1], 0.48, { base: clothMap, n: clothN, o: clothO }).setDoubleSided(true),
    Shirt: mat('Shirt', [1, 1, 1, 1], 0.55, { base: clothMap, n: clothN, o: clothO }),
    Shirt_Trim: mat('Shirt_Trim', [1, 1, 1, 1], 0.42, { base: clothMap, n: clothN, o: clothO }),
    Shorts: mat('Shorts', [1, 1, 1, 1], 0.58, { base: clothMap, n: clothN, o: clothO }),
    Socks: mat('Socks', [1, 1, 1, 1], 0.62, { base: clothMap, n: clothN, o: clothO }),
    Boots: mat('Boots', [1, 1, 1, 1], 0.42, { base: leatherMap, n: leatherN, o: leatherO }, 0.28),
    Boots_Sole: mat('Boots_Sole', [1, 1, 1, 1], 0.86, { base: leatherMap, n: leatherN, o: leatherO }),
  };
  const repeat = (m: Material) => {
    for (const info of [m.getBaseColorTextureInfo(), m.getNormalTextureInfo(), m.getOcclusionTextureInfo(), m.getMetallicRoughnessTextureInfo()]) {
      info?.setWrapS(10497).setWrapT(10497);
    }
  };
  for (const name of ['Shirt', 'Shirt_Trim', 'Shorts', 'Socks', 'Boots', 'Boots_Sole', 'Hair'] as const) repeat(materials[name]);

  const mesh = doc.createMesh('Footballer');
  for (const prim of prims) {
      const uv = doc.createAccessor().setType('VEC2').setArray(new Float32Array(prim.uv)).setBuffer(buffer);
      const p = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(prim.pos)).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(prim.nrm)).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', uv)
      .setAttribute('TEXCOORD_1', uv)
      .setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(new Float32Array(prim.col)).setBuffer(buffer))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(new Uint16Array(prim.joints)).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(new Float32Array(prim.weights)).setBuffer(buffer))
      .setAttribute('TANGENT', doc.createAccessor().setType('VEC4').setArray(tangents(prim)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(prim.idx)).setBuffer(buffer))
      .setMaterial(materials[prim.name]);
    mesh.addPrimitive(p);
  }
  const meshNode = doc.createNode('FootballerMesh').setMesh(mesh).setSkin(skin);
  scene.addChild(meshNode);

  for (const clip of clips) {
    const anim = doc.createAnimation(clip.name);
    const input = doc.createAccessor().setType('SCALAR').setArray(clip.times).setBuffer(buffer);
    const tracks = ['Hips', 'Spine', 'Neck', 'Head', 'UpperArm_L', 'UpperArm_R', 'LowerArm_L', 'LowerArm_R', 'UpperLeg_L', 'UpperLeg_R', 'LowerLeg_L', 'LowerLeg_R', 'Foot_L', 'Foot_R'];
    const rot = new Map<string, Float32Array>(tracks.map((n) => [n, new Float32Array(clip.poses.length * 4)]));
    const hipT = new Float32Array(clip.poses.length * 3);
    for (let i = 0; i < clip.poses.length; i++) {
      applyContract(built.bones, clip.poses[i]);
      for (const name of tracks) {
        const q = built.bones.get(name)!.quaternion;
        rot.get(name)!.set([q.x, q.y, q.z, q.w], i * 4);
      }
      const h = built.bones.get('Hips')!.position;
      hipT.set([h.x, h.y, h.z], i * 3);
    }
    for (const name of tracks) {
      const output = doc.createAccessor().setType('VEC4').setArray(rot.get(name)!).setBuffer(buffer);
      const sampler = doc.createAnimationSampler().setInput(input).setOutput(output).setInterpolation('LINEAR');
      anim.addSampler(sampler).addChannel(doc.createAnimationChannel().setSampler(sampler).setTargetNode(nodes.get(name)!).setTargetPath('rotation'));
    }
    const tOut = doc.createAccessor().setType('VEC3').setArray(hipT).setBuffer(buffer);
    const tSampler = doc.createAnimationSampler().setInput(input).setOutput(tOut).setInterpolation('LINEAR');
    anim.addSampler(tSampler).addChannel(doc.createAnimationChannel().setSampler(tSampler).setTargetNode(nodes.get('Hips')!).setTargetPath('translation'));
  }

  // Restore bind so inverse matrices still match the rest pose.
  applyContract(built.bones, loopingIdle(0));
  for (const name of JOINT_ORDER) {
    const bone = built.bones.get(name)!;
    bone.quaternion.identity();
    if (name === 'Hips') bone.position.y = bone.userData.restY as number;
  }
  built.scene.updateMatrixWorld(true);

  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(file, doc);
}

async function buildOne(recipe: BodyRecipe) {
  console.log('fitting', recipe.id, '…');
  const built = buildMesh(recipe);
  for (const [name, bone] of built.bones) {
    if (name === 'Hips') bone.userData.restY = bone.position.y;
    const inv = new Matrix4().copy(bone.matrixWorld).invert();
    bone.userData.inverse = inv;
  }
  const tris = triCount(built.prims);
  console.log('LOD0 triangles', tris, 'prims', built.prims.map((p) => `${p.name}:${p.idx.length / 3}`).join(' '));
  let minY = Infinity, maxY = -Infinity;
  for (const p of built.prims) for (let i = 1; i < p.pos.length; i += 3) {
    minY = Math.min(minY, p.pos[i]); maxY = Math.max(maxY, p.pos[i]);
  }
  console.log('height', +(maxY - minY).toFixed(3), 'floor', +minY.toFixed(4));
  if (tris < 35000 || tris > 50000) console.warn('triangle budget is outside 35-50k, continuing so contact can still be checked');

  resetBind(built);
  const nudge = chooseNudge(built);
  for (const side of ['left', 'right'] as const) {
    const g = bootGap(built, nudgeBoot(computePose(contactEngine(side, 0.04)), side, 1, nudge), side);
    console.log(side, 'mesh', +g.mesh.toFixed(3), 'bone', +g.bone.toFixed(3), 'Δz', +g.footDz.toFixed(3), 'toeY', +g.toeY.toFixed(3));
  }
  applyContract(built.bones, loopingIdle(0.4));
  const left = built.bones.get('Hand_L')!.getWorldPosition(new Vector3());
  const right = built.bones.get('Hand_R')!.getWorldPosition(new Vector3());
  console.log('idle hands', left.toArray().map((n) => +n.toFixed(3)), right.toArray().map((n) => +n.toFixed(3)));

  const clips = [
    { name: 'Idle', ...sampleTimes(2, loopingIdle) },
    { name: 'KickLeft', ...sampleTimes(0.9, kickFn('left', nudge)) },
    { name: 'KickRight', ...sampleTimes(0.9, kickFn('right', nudge)) },
    { name: 'Miss', ...sampleTimes(1.5, missFn) },
    { name: 'Celebrate', ...sampleTimes(1.2, celebrateFn) },
  ];
  // The arm filter must not move the contact frame off the solved pose.
  for (const name of ['KickLeft', 'KickRight'] as const) {
    const clip = clips.find((c) => c.name === name)!;
    const side = name === 'KickLeft' ? 'left' : 'right';
    const frame = clip.times.findIndex((t) => Math.abs(t - 0.3) < 1e-4);
    clip.poses[frame] = nudgeBoot(computePose(contactEngine(side, 0.04)), side, 1, nudge);
  }

  if (process.env.DUMP) {
    const lines = ['# kickole fitted'];
    let base = 1;
    for (const prim of built.prims) {
      lines.push(`o ${prim.name}`);
      for (let i = 0; i < prim.pos.length; i += 3) lines.push(`v ${prim.pos[i]} ${prim.pos[i + 1]} ${prim.pos[i + 2]}`);
      for (let t = 0; t < prim.idx.length; t += 3) {
        lines.push(`f ${prim.idx[t] + base} ${prim.idx[t + 1] + base} ${prim.idx[t + 2] + base}`);
      }
      base += prim.pos.length / 3;
    }
    writeFileSync(`/tmp/fitted-${recipe.id}.obj`, lines.join('\n'));
    console.log('wrote', `/tmp/fitted-${recipe.id}.obj`);
  }
  if (process.env.FAST) return;
  // 1K albedo stays inside the 2K cap and the 15MB first-load budget. UASTC normals/ORM are 512.
  console.log(recipe.id, 'encoding LOD0 (1k albedo)…');
  await writeGlb(built, built.prims, 1024, 512, recipe.out0, clips);
  const lod1 = built.prims.map((p) => simplifyPrim(p, 14000 / Math.max(1, tris)));
  console.log(recipe.id, 'LOD1 triangles', triCount(lod1));
  console.log(recipe.id, 'encoding LOD1 (1k albedo)…');
  await writeGlb(built, lod1, 1024, 512, recipe.out1, clips);
  console.log(recipe.id, 'bytes', readFileSync(recipe.out0).length, readFileSync(recipe.out1).length);
}

async function main() {
  await MeshoptDecoder.ready;
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const only = process.env.BODY;
  for (const recipe of RECIPES) {
    if (only && recipe.id !== only) continue;
    await buildOne(recipe);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
