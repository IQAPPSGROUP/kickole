/**
 * Street-court textures and meshes.
 *
 * Sources (CC0), downloaded or already in the repo:
 *   Poly Haven asphalt_02 — public/textures/street/asphalt_*.jpg
 *   Poly Haven concrete_wall_001 — public/textures/street/concrete_*.jpg
 *   Poly Haven concrete_floor_damaged_01 — fetched into a temp folder, not committed
 *   Poly Haven venice_sunset — public/textures/venice_sunset_1k.hdr (used at runtime, not re-encoded)
 * Paint, wear, court lines, graffiti, fence, lamps and the crowd are original.
 *
 * Outputs KTX2 (toktx) and meshopt GLBs. Run: npm run build:street
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const TOKTX = process.env.TOKTX ?? '/tmp/ktx/KTX-Software-4.4.0-Linux-x86_64/bin/toktx';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sources = join(root, 'tools/street-sources');
const street = join(root, 'public/textures/street');
const models = join(root, 'public/models/environment/street');
const srcDir = join(tmpdir(), 'kickole-street-src');
const COURT = 9;

const DAMAGE = {
  diff: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_damaged_01/concrete_floor_damaged_01_diff_1k.jpg',
  nor: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_damaged_01/concrete_floor_damaged_01_nor_gl_1k.jpg',
  rough: 'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_damaged_01/concrete_floor_damaged_01_rough_1k.jpg',
};

async function fetchFile(url: string, dest: string) {
  if (existsSync(dest) && readFileSync(dest).length > 1000) return;
  const res = await fetch(url, { headers: { 'User-Agent': 'kickole-asset-builder/1.0' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function rawRgb(file: string, width: number, height: number) {
  const { data, info } = await sharp(file).resize(width, height, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`expected rgb ${file}`);
  return data;
}

async function tile(file: string, tileSize: number, tiles: number) {
  const size = tileSize * tiles;
  const one = await sharp(file).resize(tileSize, tileSize, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const layers = [];
  for (let y = 0; y < tiles; y++) {
    for (let x = 0; x < tiles; x++) layers.push({ input: one, left: x * tileSize, top: y * tileSize });
  }
  const { data } = await sharp({ create: { width: size, height: size, channels: 3, background: '#000' } })
    .composite(layers)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return data;
}

function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function worldToPx(x: number, z: number, size: number) {
  return { px: ((x + COURT / 2) / COURT) * size, py: ((COURT / 2 - z) / COURT) * size };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

interface CourtBuffers {
  color: Buffer;
  normal: Buffer;
  rough: Buffer;
  size: number;
}

function paintCourt(size: number, asphalt: Buffer, asphaltN: Buffer, asphaltR: Buffer, damage: Buffer, damageN: Buffer, damageR: Buffer): CourtBuffers {
  const color = Buffer.from(asphalt);
  const normal = Buffer.from(asphaltN);
  const rough = Buffer.from(asphaltR);
  const n = size * size;
  const crack = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const lum = (damage[i * 3] + damage[i * 3 + 1] + damage[i * 3 + 2]) / (3 * 255);
    const asphaltLum = (color[i * 3] + color[i * 3 + 1] + color[i * 3 + 2]) / (3 * 255);
    // Large photographic pits from the damaged concrete, kept sparser than the asphalt grain.
    const pit = Math.max(0, (0.42 - lum) / 0.42);
    const t = pit * pit * 0.9;
    if (t > 0.02) {
      for (let c = 0; c < 3; c++) color[i * 3 + c] = mix(color[i * 3 + c], damage[i * 3 + c] * 0.72, t);
      for (let c = 0; c < 3; c++) normal[i * 3 + c] = mix(normal[i * 3 + c], damageN[i * 3 + c], Math.min(1, t * 1.3));
      rough[i * 3] = rough[i * 3 + 1] = rough[i * 3 + 2] = mix(asphaltR[i * 3], Math.max(damageR[i * 3], 210), t);
      crack[i] = t;
    }
    // Break the 4x4 asphalt repeat with a slow dirt wash.
    const x = i % size;
    const y = (i / size) | 0;
    const dirt = 0.9 + 0.1 * Math.sin(x * 0.008) * Math.cos(y * 0.006 + 1.7);
    const grit = 0.96 + hash(x >> 3, y >> 3) * 0.08;
    for (let c = 0; c < 3; c++) color[i * 3 + c] = Math.max(0, Math.min(255, color[i * 3 + c] * dirt * grit));
    if (asphaltLum < 0) rough[i * 3] = 0;
  }

  const paint = (x0: number, z0: number, x1: number, z1: number, width: number) => {
    const a = worldToPx(x0, z0, size);
    const b = worldToPx(x1, z1, size);
    const radius = Math.max(1.2, (width / COURT) * size * 0.5);
    const minX = Math.max(0, Math.floor(Math.min(a.px, b.px) - radius - 1));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(a.px, b.px) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(a.py, b.py) - radius - 1));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(a.py, b.py) + radius + 1));
    const abx = b.px - a.px;
    const aby = b.py - a.py;
    const ab2 = abx * abx + aby * aby || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - a.px) * abx + (y - a.py) * aby) / ab2));
        const dx = x - (a.px + abx * t);
        const dy = y - (a.py + aby * t);
        const d = Math.hypot(dx, dy);
        if (d > radius) continue;
        const edge = 1 - d / radius;
        const chip = hash(x, y);
        if (chip < 0.16) continue;
        const fade = Math.min(1, edge * 1.8) * (0.62 + chip * 0.38);
        const o = (y * size + x) * 3;
        color[o] = mix(color[o], 232, fade);
        color[o + 1] = mix(color[o + 1], 224, fade);
        color[o + 2] = mix(color[o + 2], 206, fade);
        rough[o] = rough[o + 1] = rough[o + 2] = mix(rough[o], 118, fade);
      }
    }
  };

  const ring = (cx: number, cz: number, radius: number, width: number) => {
    const steps = Math.max(24, Math.floor((radius / COURT) * size * 0.5));
    for (let i = 0; i < steps; i++) {
      const a0 = (i / steps) * Math.PI * 2;
      const a1 = ((i + 1) / steps) * Math.PI * 2;
      paint(cx + Math.cos(a0) * radius, cz + Math.sin(a0) * radius, cx + Math.cos(a1) * radius, cz + Math.sin(a1) * radius, width);
    }
  };

  const x0 = -3.15;
  const x1 = 3.15;
  const z0 = -2.75;
  const z1 = 2.95;
  paint(x0, z0, x1, z0, 0.09);
  paint(x0, z1, x1, z1, 0.09);
  paint(x0, z0, x0, z1, 0.09);
  paint(x1, z0, x1, z1, 0.09);
  paint(x0, 0.05, x1, 0.05, 0.08);
  ring(0, 0.05, 1.08, 0.08);
  ring(0, 0.05, 0.12, 0.1);
  // Penalty boxes.
  for (const gz of [z0, z1]) {
    const dir = gz < 0 ? 1 : -1;
    const depth = 1.15 * dir;
    paint(x0 + 0.85, gz, x0 + 0.85, gz + depth, 0.07);
    paint(x1 - 0.85, gz, x1 - 0.85, gz + depth, 0.07);
    paint(x0 + 0.85, gz + depth, x1 - 0.85, gz + depth, 0.07);
  }
  // Corner arcs.
  for (const [cx, cz, a0] of [[x0, z0, 0], [x1, z0, Math.PI / 2], [x0, z1, -Math.PI / 2], [x1, z1, Math.PI]] as const) {
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t0 = a0 + (i / steps) * (Math.PI / 2);
      const t1 = a0 + ((i + 1) / steps) * (Math.PI / 2);
      paint(cx + Math.cos(t0) * 0.38, cz + Math.sin(t0) * 0.38, cx + Math.cos(t1) * 0.38, cz + Math.sin(t1) * 0.38, 0.06);
    }
  }

  // Contact wear at the centre and a baked shadow along the back wall.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wx = (x / size) * COURT - COURT / 2;
      const wz = COURT / 2 - (y / size) * COURT;
      const o = (y * size + x) * 3;
      const center = Math.hypot(wx / 1.3, (wz - 0.2) / 1.1);
      if (center < 1) {
        const t = (1 - center) * 0.22;
        for (let c = 0; c < 3; c++) color[o + c] = color[o + c] * (1 - t);
        rough[o] = rough[o + 1] = rough[o + 2] = mix(rough[o], 200, t * 2);
      }
      if (wz < -2.5) {
        const t = Math.min(0.45, (-2.5 - wz) / 3);
        for (let c = 0; c < 3; c++) color[o + c] = color[o + c] * (1 - t);
      }
      if (Math.abs(wx) > 3.4) {
        const t = Math.min(0.35, (Math.abs(wx) - 3.4) / 2);
        for (let c = 0; c < 3; c++) color[o + c] = color[o + c] * (1 - t);
      }
    }
  }

  return { color, normal, rough, size };
}

const MURAL = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="2048" height="592" viewBox="0 0 2048 592" xmlns="http://www.w3.org/2000/svg">
  <g opacity="0.95">
    <path d="M70 470 C180 80 420 520 560 140" fill="none" stroke="#1a120e" stroke-width="70" stroke-linecap="round" opacity="0.35"/>
    <path d="M90 450 C200 110 400 490 540 170" fill="none" stroke="#d7b15a" stroke-width="28" stroke-linecap="round" opacity="0.8"/>
    <path d="M150 430 L150 170 L340 170 Q470 170 470 290 Q470 390 330 390 L210 390 L430 470"
      fill="none" stroke="#14110f" stroke-width="78" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M150 430 L150 170 L340 170 Q470 170 470 290 Q470 390 330 390 L210 390 L430 470"
      fill="none" stroke="#d4533c" stroke-width="52" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M560 180 L560 430 L760 430 L760 330 L620 330 L620 280 L740 280 L740 180 Z"
      fill="none" stroke="#14110f" stroke-width="70" stroke-linejoin="round"/>
    <path d="M560 180 L560 430 L760 430 L760 330 L620 330 L620 280 L740 280 L740 180 Z"
      fill="none" stroke="#e6d7b8" stroke-width="46" stroke-linejoin="round"/>
    <path d="M860 160 L1040 430 L980 430 L940 340 L780 340 L740 430 L680 430 Z"
      fill="#14110f"/>
    <path d="M800 300 L920 300 L860 175 Z" fill="#1f6f78"/>
    <g fill="#14110f">
      <rect x="190" y="430" width="10" height="46"/><rect x="230" y="438" width="8" height="34"/>
      <rect x="600" y="430" width="9" height="40"/><rect x="700" y="428" width="7" height="28"/>
      <rect x="900" y="430" width="8" height="36"/>
    </g>
    <circle cx="1320" cy="290" r="150" fill="#f3efe4" stroke="#161311" stroke-width="16"/>
    <path d="M1320 180 L1368 230 L1350 290 L1290 290 L1272 230 Z" fill="#161311"/>
    <path d="M1240 250 L1290 290 L1275 350 L1205 340 L1195 285 Z" fill="#161311" opacity="0.9"/>
    <path d="M1400 250 L1368 230 L1350 290 L1405 315 L1440 270 Z" fill="#161311" opacity="0.9"/>
    <path d="M1275 350 L1320 400 L1365 350 L1350 290 L1290 290 Z" fill="#161311" opacity="0.85"/>
    <circle cx="1320" cy="290" r="150" fill="none" stroke="#161311" stroke-width="10"/>
    <g font-family="Inter, Liberation Sans, sans-serif" font-weight="800">
      <text x="1540" y="250" font-size="150" fill="#14110f">07</text>
      <text x="1552" y="242" font-size="150" fill="#d7b15a">07</text>
      <text x="1560" y="430" font-size="64" fill="#1f6f78">JOGO</text>
    </g>
    <g fill="#d4533c" opacity="0.75">
      <circle cx="170" cy="120" r="5"/><circle cx="210" cy="150" r="3"/><circle cx="480" cy="110" r="4"/>
      <circle cx="900" cy="130" r="3"/><circle cx="1180" cy="160" r="5"/><circle cx="1600" cy="120" r="4"/>
      <circle cx="1900" cy="200" r="3"/><circle cx="400" cy="500" r="4"/><circle cx="1100" cy="480" r="3"/>
    </g>
    <path d="M1680 80 C1760 200 1700 360 1860 470" fill="none" stroke="#1f6f78" stroke-width="22" stroke-linecap="round" opacity="0.85"/>
    <path d="M40 80 H2000" fill="none" stroke="#14110f" stroke-width="8" opacity="0.25"/>
  </g>
</svg>`;

const TAG = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="1024" height="1024" fill="#000" fill-opacity="0"/>
  <circle cx="512" cy="470" r="250" fill="#f3efe4" stroke="#161311" stroke-width="22"/>
  <path d="M512 280 L590 370 L560 470 L464 470 L434 370 Z" fill="#161311"/>
  <path d="M400 410 L464 470 L440 570 L340 550 Z" fill="#161311"/>
  <path d="M624 410 L590 370 L560 470 L650 510 L700 430 Z" fill="#161311"/>
  <text x="512" y="860" text-anchor="middle" font-family="Inter, Liberation Sans, sans-serif" font-size="140" font-weight="800" fill="#d4533c">RUA</text>
</svg>`;

function decalSkid(size: number) {
  const buf = Buffer.alloc(size * size * 4);
  const stamp = (x0: number, y0: number, x1: number, y1: number, radius: number, alpha: number) => {
    const minX = Math.max(0, Math.floor(Math.min(x0, x1) - radius));
    const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1) + radius));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1) - radius));
    const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1) + radius));
    const abx = x1 - x0;
    const aby = y1 - y0;
    const ab2 = abx * abx + aby * aby || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const t = Math.max(0, Math.min(1, ((x - x0) * abx + (y - y0) * aby) / ab2));
        const d = Math.hypot(x - (x0 + abx * t), y - (y0 + aby * t));
        if (d > radius) continue;
        const o = (y * size + x) * 4;
        const a = Math.min(255, buf[o + 3] + alpha * (1 - d / radius));
        buf[o] = 18; buf[o + 1] = 16; buf[o + 2] = 14; buf[o + 3] = a;
      }
    }
  };
  stamp(80, 420, 430, 180, 26, 150);
  stamp(120, 450, 460, 210, 16, 110);
  stamp(200, 300, 360, 120, 10, 80);
  return buf;
}

function decalStencil(size: number) {
  const buf = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const ring = Math.abs(d - size * 0.32);
      const star = Math.abs(((Math.atan2(y - cy, x - cx) / Math.PI) * 5) % 2 - 1);
      const onRing = ring < size * 0.035 ? 1 - ring / (size * 0.035) : 0;
      const onStar = d < size * 0.2 && star < 0.35 ? 0.8 : 0;
      const a = Math.max(onRing, onStar) * (0.45 + hash(x, y) * 0.55);
      if (a < 0.08) continue;
      const o = (y * size + x) * 4;
      buf[o] = 210; buf[o + 1] = 176; buf[o + 2] = 90; buf[o + 3] = Math.min(255, a * 180);
    }
  }
  return buf;
}

async function ktx(png: Buffer, oetf: 'srgb' | 'linear', encode: 'uastc' | 'etc1s', dest: string) {
  const dir = join(tmpdir(), 'kickole-street-ktx');
  mkdirSync(dir, { recursive: true });
  const input = join(dir, 'in.png');
  const output = join(dir, 'out.ktx2');
  writeFileSync(input, png);
  const args = ['--genmipmap', '--encode', encode, '--assign_oetf', oetf];
  if (encode === 'uastc') args.push('--uastc_quality', '1');
  else args.push('--clevel', '2', '--qlevel', '128');
  args.push(output, input);
  execFileSync(TOKTX, args, { stdio: 'pipe' });
  const bytes = readFileSync(output);
  writeFileSync(dest, bytes);
  console.log(dest.replace(root + '/', ''), bytes.length);
}

async function encodeRgb(raw: Buffer, width: number, height: number, oetf: 'srgb' | 'linear', encode: 'uastc' | 'etc1s', dest: string) {
  const png = await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
  await ktx(png, oetf, encode, dest);
}

async function encodeRgba(raw: Buffer, width: number, height: number, dest: string) {
  const png = await sharp(raw, { raw: { width, height, channels: 4 } }).png().toBuffer();
  await ktx(png, 'srgb', 'etc1s', dest);
}

class Geo {
  pos: number[] = [];
  nrm: number[] = [];
  idx: number[] = [];

  private vert(p: number[], n: number[]) {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    return i;
  }

  private face(verts: number[][], normal: number[]) {
    const a = this.vert(verts[0], normal);
    const b = this.vert(verts[1], normal);
    const c = this.vert(verts[2], normal);
    const d = this.vert(verts[3], normal);
    this.idx.push(a, b, c, a, c, d);
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, rz = 0) {
    const hx = sx / 2;
    const hy = sy / 2;
    const hz = sz / 2;
    const c = Math.cos(rz);
    const s = Math.sin(rz);
    const rot = (x: number, y: number, z: number) => [cx + x * c - y * s, cy + x * s + y * c, cz + z];
    const rotN = (x: number, y: number, z: number) => [x * c - y * s, x * s + y * c, z];
    const faces: { n: number[]; v: number[][] }[] = [
      { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
      { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
      { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
      { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
      { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
      { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
    ];
    for (const face of faces) {
      this.face(face.v.map((p) => rot(p[0], p[1], p[2])), rotN(face.n[0], face.n[1], face.n[2]));
    }
  }

  cylinderY(cx: number, cy: number, cz: number, radiusTop: number, radiusBottom: number, height: number, seg: number) {
    const y0 = cy - height / 2;
    const y1 = cy + height / 2;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0);
      const s0 = Math.sin(a0);
      const c1 = Math.cos(a1);
      const s1 = Math.sin(a1);
      const p0b = [cx + c0 * radiusBottom, y0, cz + s0 * radiusBottom];
      const p1b = [cx + c1 * radiusBottom, y0, cz + s1 * radiusBottom];
      const p0t = [cx + c0 * radiusTop, y1, cz + s0 * radiusTop];
      const p1t = [cx + c1 * radiusTop, y1, cz + s1 * radiusTop];
      const n0 = [c0, 0, s0];
      const n1 = [c1, 0, s1];
      const i0 = this.vert(p0b, n0);
      const i1 = this.vert(p1b, n1);
      const i2 = this.vert(p1t, n1);
      const i3 = this.vert(p0t, n0);
      this.idx.push(i0, i1, i2, i0, i2, i3);
    }
    const top = this.vert([cx, y1, cz], [0, 1, 0]);
    const bot = this.vert([cx, y0, cz], [0, -1, 0]);
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const t0 = this.vert([cx + Math.cos(a0) * radiusTop, y1, cz + Math.sin(a0) * radiusTop], [0, 1, 0]);
      const t1 = this.vert([cx + Math.cos(a1) * radiusTop, y1, cz + Math.sin(a1) * radiusTop], [0, 1, 0]);
      this.idx.push(top, t0, t1);
      const b0 = this.vert([cx + Math.cos(a0) * radiusBottom, y0, cz + Math.sin(a0) * radiusBottom], [0, -1, 0]);
      const b1 = this.vert([cx + Math.cos(a1) * radiusBottom, y0, cz + Math.sin(a1) * radiusBottom], [0, -1, 0]);
      this.idx.push(bot, b1, b0);
    }
  }

  sphere(cx: number, cy: number, cz: number, r: number, segW: number, segH: number, squashY = 1) {
    const point = (phi: number, th: number) => {
      const sy = Math.cos(phi);
      const sr = Math.sin(phi);
      return [cx + Math.cos(th) * sr * r, cy + sy * r * squashY, cz + Math.sin(th) * sr * r];
    };
    const normal = (phi: number, th: number) => {
      const sy = Math.cos(phi);
      const sr = Math.sin(phi);
      const y = sy / squashY;
      const len = Math.hypot(Math.cos(th) * sr, y, Math.sin(th) * sr) || 1;
      return [Math.cos(th) * sr / len, y / len, Math.sin(th) * sr / len];
    };
    for (let y = 0; y < segH; y++) {
      const phi0 = (y / segH) * Math.PI;
      const phi1 = ((y + 1) / segH) * Math.PI;
      for (let x = 0; x < segW; x++) {
        const th0 = (x / segW) * Math.PI * 2;
        const th1 = ((x + 1) / segW) * Math.PI * 2;
        const a = this.vert(point(phi0, th0), normal(phi0, th0));
        const b = this.vert(point(phi0, th1), normal(phi0, th1));
        const c = this.vert(point(phi1, th1), normal(phi1, th1));
        const d = this.vert(point(phi1, th0), normal(phi1, th0));
        this.idx.push(a, d, c, a, c, b);
      }
    }
  }

  tris() {
    return this.idx.length / 3;
  }
}

type Role = 'cloth' | 'skin' | 'metal' | 'lens';

interface Part {
  name: string;
  geo: Geo;
  pivot: [number, number, number];
  role: Role;
}

function fencePanel(cell: number): Geo {
  const g = new Geo();
  const width = 1.8;
  const height = 0.82;
  for (let y = cell / 2; y < height - 0.04; y += cell) {
    for (let x = -width / 2 + cell / 2; x < width / 2 - 0.02; x += cell) {
      const len = cell * 0.94;
      g.box(x, y, 0, len, 0.012, 0.008, Math.PI / 4);
      g.box(x, y, 0, len, 0.012, 0.008, -Math.PI / 4);
    }
  }
  g.box(0, height - 0.02, 0, width, 0.04, 0.028);
  g.box(0, 0.02, 0, width, 0.028, 0.022);
  return g;
}

function fencePost(): Geo {
  const g = new Geo();
  g.cylinderY(0, 0.42, 0, 0.032, 0.026, 0.84, 6);
  g.box(0, 0.86, 0, 0.07, 0.035, 0.07);
  return g;
}

function lampParts(): Part[] {
  const metal = new Geo();
  metal.box(0, 0.04, 0, 0.36, 0.08, 0.36);
  metal.cylinderY(0, 1.78, 0, 0.05, 0.034, 3.36, 8);
  metal.box(0.38, 3.48, 0, 0.86, 0.055, 0.07);
  metal.box(0.72, 3.34, 0, 0.46, 0.18, 0.24);
  metal.box(0.72, 3.46, 0, 0.52, 0.045, 0.3);
  const lens = new Geo();
  lens.box(0.72, 3.24, 0, 0.3, 0.035, 0.16);
  return [
    { name: 'Lamp', geo: metal, pivot: [0, 0, 0], role: 'metal' },
    { name: 'Lens', geo: lens, pivot: [0, 0, 0], role: 'lens' },
  ];
}

function crowdLod0(): Part[] {
  const torso = new Geo();
  torso.box(0, 0.18, 0, 0.34, 0.36, 0.18);
  torso.box(0, 0.34, 0, 0.46, 0.1, 0.16);
  const shorts = new Geo();
  shorts.box(0, 0.05, 0, 0.32, 0.14, 0.16);
  const head = new Geo();
  head.sphere(0, 0.02, 0.01, 0.115, 10, 8);
  const arm = new Geo();
  arm.cylinderY(0, -0.22, 0, 0.045, 0.034, 0.42, 6);
  arm.sphere(0, -0.44, 0, 0.04, 5, 4);
  const leg = new Geo();
  leg.cylinderY(0, -0.34, 0, 0.055, 0.042, 0.64, 6);
  leg.box(0, -0.68, 0.04, 0.09, 0.06, 0.16);
  const hair = new Geo();
  hair.sphere(0, 0.03, 0, 0.122, 8, 6, 0.62);
  const afro = new Geo();
  afro.sphere(0, 0.02, 0, 0.15, 8, 6);
  const hat = new Geo();
  hat.cylinderY(0, 0.05, 0, 0.118, 0.13, 0.1, 8);
  hat.cylinderY(0, -0.015, 0, 0.17, 0.17, 0.028, 8);
  return [
    { name: 'Torso', geo: torso, pivot: [0, 1.0, 0], role: 'cloth' },
    { name: 'Shorts', geo: shorts, pivot: [0, 0.84, 0], role: 'cloth' },
    { name: 'Head', geo: head, pivot: [0, 1.5, 0], role: 'skin' },
    { name: 'ArmL', geo: arm, pivot: [-0.24, 1.36, 0], role: 'skin' },
    { name: 'ArmR', geo: arm, pivot: [0.24, 1.36, 0], role: 'skin' },
    { name: 'LegL', geo: leg, pivot: [-0.09, 0.84, 0], role: 'skin' },
    { name: 'LegR', geo: leg, pivot: [0.09, 0.84, 0], role: 'skin' },
    { name: 'Hair', geo: hair, pivot: [0, 1.6, 0], role: 'cloth' },
    { name: 'Afro', geo: afro, pivot: [0, 1.6, 0], role: 'cloth' },
    { name: 'Hat', geo: hat, pivot: [0, 1.64, 0], role: 'cloth' },
  ];
}

function crowdLod1(): Part[] {
  const torso = new Geo();
  torso.box(0, 0.16, 0, 0.34, 0.42, 0.16);
  const head = new Geo();
  head.sphere(0, 0, 0, 0.11, 6, 5);
  const arm = new Geo();
  arm.box(0, -0.2, 0, 0.07, 0.4, 0.07);
  const leg = new Geo();
  leg.box(0, -0.32, 0, 0.09, 0.62, 0.09);
  const hair = new Geo();
  hair.box(0, 0.04, 0, 0.2, 0.08, 0.16);
  return [
    { name: 'Torso', geo: torso, pivot: [0, 1.02, 0], role: 'cloth' },
    { name: 'Head', geo: head, pivot: [0, 1.5, 0], role: 'skin' },
    { name: 'ArmL', geo: arm, pivot: [-0.22, 1.34, 0], role: 'skin' },
    { name: 'ArmR', geo: arm, pivot: [0.22, 1.34, 0], role: 'skin' },
    { name: 'LegL', geo: leg, pivot: [-0.09, 0.9, 0], role: 'skin' },
    { name: 'LegR', geo: leg, pivot: [0.09, 0.9, 0], role: 'skin' },
    { name: 'Hair', geo: hair, pivot: [0, 1.58, 0], role: 'cloth' },
  ];
}

function crowdLod2(): Part[] {
  const body = new Geo();
  body.box(0, 0.42, 0, 0.32, 0.78, 0.16);
  const head = new Geo();
  head.sphere(0, 0, 0, 0.11, 5, 4);
  return [
    { name: 'Body', geo: body, pivot: [0, 0.42, 0], role: 'cloth' },
    { name: 'Head', geo: head, pivot: [0, 1.0, 0], role: 'skin' },
  ];
}

async function writeGlb(file: string, parts: Part[]) {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Street');
  doc.getRoot().setDefaultScene(scene);
  const materials = {
    cloth: doc.createMaterial('Cloth').setRoughnessFactor(0.78).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]),
    skin: doc.createMaterial('Skin').setRoughnessFactor(0.64).setMetallicFactor(0).setBaseColorFactor([1, 1, 1, 1]),
    metal: doc.createMaterial('Metal').setRoughnessFactor(0.32).setMetallicFactor(0.84).setBaseColorFactor([0.72, 0.76, 0.78, 1]),
    lens: doc.createMaterial('Lens').setRoughnessFactor(0.18).setMetallicFactor(0).setEmissiveFactor([1, 0.72, 0.38]).setBaseColorFactor([1, 0.86, 0.62, 1]),
  };
  const root = doc.createNode('Root');
  scene.addChild(root);
  let tris = 0;
  for (const part of parts) {
    const pos = new Float32Array(part.geo.pos);
    const nrm = new Float32Array(part.geo.nrm);
    const idx = new Uint32Array(part.geo.idx);
    tris += idx.length / 3;
    const prim = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(nrm).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer))
      .setMaterial(materials[part.role]);
    const mesh = doc.createMesh(part.name).addPrimitive(prim);
    root.addChild(doc.createNode(part.name).setMesh(mesh).setTranslation(part.pivot));
  }
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(file, doc);
  const bytes = readFileSync(file).length;
  console.log(file.replace(root + '/', ''), 'tris', tris, 'bytes', bytes);
  return { tris, bytes };
}

async function main() {
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(models, { recursive: true });
  await fetchFile(DAMAGE.diff, join(srcDir, 'damage_diff.jpg'));
  await fetchFile(DAMAGE.nor, join(srcDir, 'damage_nor.jpg'));
  await fetchFile(DAMAGE.rough, join(srcDir, 'damage_rough.jpg'));

  const size = 2048;
  const asphalt = await tile(join(sources, 'asphalt_diff.jpg'), 512, 4);
  const asphaltN = await tile(join(sources, 'asphalt_nor.jpg'), 512, 4);
  const asphaltR = await tile(join(sources, 'asphalt_rough.jpg'), 512, 4);
  const damage = await tile(join(srcDir, 'damage_diff.jpg'), 1024, 2);
  const damageN = await tile(join(srcDir, 'damage_nor.jpg'), 1024, 2);
  const damageR = await tile(join(srcDir, 'damage_rough.jpg'), 1024, 2);
  const court = paintCourt(size, asphalt, asphaltN, asphaltR, damage, damageN, damageR);

  const previewDir = '/opt/cursor/artifacts';
  mkdirSync(previewDir, { recursive: true });
  await sharp(court.color, { raw: { width: size, height: size, channels: 3 } }).png().toFile(join(previewDir, 'street-court-color.png'));

  const low = 512;
  const courtLow = await sharp(court.color, { raw: { width: size, height: size, channels: 3 } }).resize(low, low).removeAlpha().raw().toBuffer();

  const normal1k = await sharp(court.normal, { raw: { width: size, height: size, channels: 3 } }).resize(1024, 1024).removeAlpha().raw().toBuffer();
  const rough512 = await sharp(court.rough, { raw: { width: size, height: size, channels: 3 } }).resize(512, 512).removeAlpha().raw().toBuffer();
  await encodeRgb(court.color, size, size, 'srgb', 'etc1s', join(street, 'court_color.ktx2'));
  await encodeRgb(normal1k, 1024, 1024, 'linear', 'uastc', join(street, 'court_normal.ktx2'));
  await encodeRgb(rough512, 512, 512, 'linear', 'etc1s', join(street, 'court_rough.ktx2'));
  await encodeRgb(courtLow, low, low, 'srgb', 'etc1s', join(street, 'court_color_low.ktx2'));

  const wallW = 2048;
  const wallH = 592;
  const concrete = await rawRgb(join(sources, 'concrete_diff.jpg'), wallW, wallH);
  const concreteN = await rawRgb(join(sources, 'concrete_nor.jpg'), wallW, wallH);
  const concreteR = await rawRgb(join(sources, 'concrete_rough.jpg'), wallW, wallH);
  const mural = await sharp(Buffer.from(MURAL)).png().toBuffer();
  const wallColor = await sharp(concrete, { raw: { width: wallW, height: wallH, channels: 3 } })
    .composite([{ input: mural, blend: 'over' }])
    .removeAlpha()
    .raw()
    .toBuffer();
  await sharp(wallColor, { raw: { width: wallW, height: wallH, channels: 3 } }).png().toFile(join(previewDir, 'street-wall-color.png'));
  const wallLowW = 512;
  const wallLowH = 148;
  const wallLow = await sharp(wallColor, { raw: { width: wallW, height: wallH, channels: 3 } }).resize(wallLowW, wallLowH).removeAlpha().raw().toBuffer();
  const wallN = await sharp(concreteN, { raw: { width: wallW, height: wallH, channels: 3 } }).resize(1024, 296).removeAlpha().raw().toBuffer();
  const wallR = await sharp(concreteR, { raw: { width: wallW, height: wallH, channels: 3 } }).resize(1024, 296).removeAlpha().raw().toBuffer();
  await encodeRgb(wallColor, wallW, wallH, 'srgb', 'etc1s', join(street, 'wall_color.ktx2'));
  await encodeRgb(wallN, 1024, 296, 'linear', 'uastc', join(street, 'wall_normal.ktx2'));
  await encodeRgb(wallR, 1024, 296, 'linear', 'etc1s', join(street, 'wall_rough.ktx2'));
  await encodeRgb(wallLow, wallLowW, wallLowH, 'srgb', 'etc1s', join(street, 'wall_color_low.ktx2'));

  const tagBase = await rawRgb(join(sources, 'concrete_diff.jpg'), 1024, 1024);
  const tagSvg = await sharp(Buffer.from(TAG)).png().toBuffer();
  const tag = await sharp(tagBase, { raw: { width: 1024, height: 1024, channels: 3 } })
    .composite([{ input: tagSvg, blend: 'over' }])
    .removeAlpha()
    .raw()
    .toBuffer();
  // Side-wall tag is stored as the stencil's sibling concrete swatch only when it has paint.
  // The runtime samples wall_color for the back wall. The tag is a decal texture with alpha
  // punched from the SVG's painted pixels.
  const tagPng = await sharp(tag, { raw: { width: 1024, height: 1024, channels: 3 } }).ensureAlpha().raw().toBuffer();
  const svgAlpha = await sharp(tagSvg).ensureAlpha().resize(1024, 1024).raw().toBuffer();
  for (let i = 0; i < 1024 * 1024; i++) tagPng[i * 4 + 3] = svgAlpha[i * 4 + 3] > 16 ? 255 : 0;
  await encodeRgba(tagPng, 1024, 1024, join(street, 'decal_tag.ktx2'));

  const c1024 = await rawRgb(join(sources, 'concrete_diff.jpg'), 1024, 1024);
  const cN = await rawRgb(join(sources, 'concrete_nor.jpg'), 512, 512);
  const cR = await rawRgb(join(sources, 'concrete_rough.jpg'), 512, 512);
  await encodeRgb(c1024, 1024, 1024, 'srgb', 'etc1s', join(street, 'concrete_color.ktx2'));
  await encodeRgb(cN, 512, 512, 'linear', 'uastc', join(street, 'concrete_normal.ktx2'));
  await encodeRgb(cR, 512, 512, 'linear', 'etc1s', join(street, 'concrete_rough.ktx2'));

  await encodeRgba(decalSkid(512), 512, 512, join(street, 'decal_skid.ktx2'));
  await encodeRgba(decalStencil(512), 512, 512, join(street, 'decal_stencil.ktx2'));

  const fence0 = fencePanel(0.16);
  const fence1 = fencePanel(0.32);
  const post = fencePost();
  const manifest = {
    sources: [
      'Poly Haven asphalt_02 CC0',
      'Poly Haven concrete_wall_001 CC0',
      'Poly Haven concrete_floor_damaged_01 CC0',
      'Poly Haven venice_sunset CC0',
      'Original paint, lines, graffiti, fence, lamp and crowd',
    ],
    fenceLod0: await writeGlb(join(models, 'fence-lod0.glb'), [
      { name: 'Panel', geo: fence0, pivot: [0, 0, 0], role: 'metal' },
      { name: 'Post', geo: post, pivot: [0, 0, 0], role: 'metal' },
    ]),
    fenceLod1: await writeGlb(join(models, 'fence-lod1.glb'), [
      { name: 'Panel', geo: fence1, pivot: [0, 0, 0], role: 'metal' },
      { name: 'Post', geo: post, pivot: [0, 0, 0], role: 'metal' },
    ]),
    lamp: await writeGlb(join(models, 'lamp.glb'), lampParts()),
    crowdLod0: await writeGlb(join(models, 'crowd-lod0.glb'), crowdLod0()),
    crowdLod1: await writeGlb(join(models, 'crowd-lod1.glb'), crowdLod1()),
    crowdLod2: await writeGlb(join(models, 'crowd-lod2.glb'), crowdLod2()),
  };
  writeFileSync(join(models, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (!(manifest.crowdLod0.tris > manifest.crowdLod1.tris && manifest.crowdLod1.tris > manifest.crowdLod2.tris)) {
    throw new Error('crowd LODs are not strictly simpler');
  }
  if (!(manifest.fenceLod0.tris > manifest.fenceLod1.tris)) throw new Error('fence LODs are not strictly simpler');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
