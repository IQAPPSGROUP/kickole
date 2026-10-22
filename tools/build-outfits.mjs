/**
 * Builds small skinned outfit GLBs from the kickole_player_v4 body surface.
 * Shells share the source joint order and inverse bind matrices.
 * Boots are a flat upper plus a dark sole: no stripe texture and no lace mesh.
 * Shadow Hero has a brow band only — no cape, cowl, bat symbol, or chest emblem.
 */
import { mkdirSync, statSync } from 'node:fs';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMaterialsClearcoat, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const BODIES = {
  male: 'public/models/kickole_player_v4.glb',
  female: 'public/models/kickole_player_v4_female.glb',
};
const OUT_DIR = 'public/models/outfits';
const MAX_BYTES = 180_000;

const CLOTH = { roughness: 0.78, metalness: 0 };
const BOOT = { roughness: 0.72, metalness: 0.04 };
const SOLE_MAT = { roughness: 0.92, metalness: 0 };
const PLATE = { roughness: 0.34, metalness: 0.62 };
const CHAIN = { roughness: 0.55, metalness: 0.28 };

function linear(channel) {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function hex(color) {
  const n = Number.parseInt(color.slice(1), 16);
  return [linear(((n >> 16) & 255) / 255), linear(((n >> 8) & 255) / 255), linear((n & 255) / 255), 1];
}

const GREEN = hex('#3CB44A');
const BELLY = hex('#E4E7A4');
const SPIKE = hex('#163318');
const DINO_BOOT = hex('#217A32');
const SOLE = hex('#141414');
const PLATE_COLOR = hex('#C8CCD1');
const CHAIN_COLOR = hex('#7E868E');
const TABARD = hex('#7A2030');
const MARK = hex('#E2B34A');
const HELMET = hex('#D5D8DC');
const KNIGHT_BOOT = hex('#24262A');
const NIGHT = hex('#2C3036');
const BROW = hex('#9AA3AC');
const NIGHT_BOOT = hex('#1A1C20');
const WHITE = hex('#F7F5ED');
const APRON = hex('#E7E2D6');
const BLACK = hex('#161616');
const CARD_RED = hex('#C0392B');
const CARD_YELLOW = hex('#F2C14E');
const SNOW = hex('#F4F8FC');
const SCARF = hex('#E24B4B');
const BUTTON = hex('#2A2E33');
const CARROT = hex('#E07A3D');
const GOLD = hex('#E3B341');
const GOLD_BOOT = hex('#C4922A');
const TEAL = hex('#1F8A8A');
const CORAL = hex('#F26B5B');
const ALIEN_GREEN = hex('#2F9A5A');
const ALIEN_DARK = hex('#1F6B45');
const SPACE = hex('#F4F7F8');
const VISOR = hex('#7E93A3');
const PACK = hex('#D5DDE3');
const NINJA = hex('#1C1C1C');
const NINJA_BAND = hex('#C0392B');
const PIRATE_LIGHT = hex('#F4F1EA');
const PIRATE_DARK = hex('#6B1D1D');
const WAIST = hex('#1E3A5F');
const AGENT = hex('#1E2430');
const GLASS = hex('#14161C');
const LUCHA_RED = hex('#E23B4A');
const LUCHA_TEAL = hex('#1F6B8A');
const LUCHA_DOT = hex('#F2C14E');
const ROCK = hex('#2B241C');
const QUIFF = hex('#1A120C');
const ORANGE = hex('#E07A3D');
const YELLOW = hex('#F2C14E');
const TAN_BOOT = hex('#C46A32');
const MOUSTACHE = hex('#4A3428');
const SANTA = hex('#B4232A');
const SANTA_BOOT = hex('#8E1C22');
const ZOMBIE = hex('#8E9089');
const WRAP = hex('#E4E0D4');
const ZOMBIE_BOOT = hex('#5E615C');
const GOLD_MAT = { roughness: 0.28, metalness: 0.72 };
const LEATHER = { roughness: 0.45, metalness: 0.18 };

function decodeVec(accessor) {
  const raw = accessor.getArray();
  const out = new Float32Array(raw.length);
  if (!accessor.getNormalized()) {
    out.set(raw);
    return out;
  }
  const type = accessor.getComponentType();
  const denom = type === 5122 ? 32767 : type === 5123 ? 65535 : type === 5121 ? 255 : type === 5120 ? 127 : 1;
  for (let i = 0; i < raw.length; i++) out[i] = raw[i] / denom;
  return out;
}

function boundsOf(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], positions[i + k]);
      max[k] = Math.max(max[k], positions[i + k]);
    }
  }
  return { min, max };
}

function classify(name, bounds) {
  if (name === 'Boots_Sole') return 'sole';
  if (name === 'Boots') return 'boots';
  if (name === 'Socks') return 'socks';
  if (name === 'Shorts') return 'shorts';
  if (name === 'Shirt' || name === 'Shirt_Trim') return 'shirt';
  if (name === 'Eyes') return 'eyes';
  if (name === 'Hair') return 'hair';
  if (name === 'Skin') {
    const cx = (bounds.min[0] + bounds.max[0]) / 2;
    const cy = (bounds.min[1] + bounds.max[1]) / 2;
    if (bounds.max[1] > 0.55 && Math.abs(cx) < 0.3) return 'head';
    if (Math.abs(cx) > 0.18) return 'arm';
    if (cy < 0.05) return 'thigh';
    return 'skin';
  }
  return 'other';
}

function merge(parts) {
  let posCount = 0;
  let idxCount = 0;
  for (const part of parts) {
    posCount += part.positions.length;
    idxCount += part.indices.length;
  }
  const positions = new Float32Array(posCount);
  const joints = new Uint8Array(posCount / 3 * 4);
  const weights = new Float32Array(posCount / 3 * 4);
  const indices = new Uint32Array(idxCount);
  let vertexBase = 0;
  let posWrite = 0;
  let jointWrite = 0;
  let indexWrite = 0;
  for (const part of parts) {
    positions.set(part.positions, posWrite);
    joints.set(part.joints, jointWrite);
    weights.set(part.weights, jointWrite);
    for (let i = 0; i < part.indices.length; i++) indices[indexWrite + i] = part.indices[i] + vertexBase;
    vertexBase += part.positions.length / 3;
    posWrite += part.positions.length;
    jointWrite += part.joints.length;
    indexWrite += part.indices.length;
  }
  return { positions, joints, weights, indices };
}

function weld(mesh) {
  const map = new Map();
  const count = mesh.positions.length / 3;
  const remap = new Uint32Array(count);
  const positions = [];
  const joints = [];
  const weights = [];
  for (let i = 0; i < count; i++) {
    const x = mesh.positions[i * 3];
    const y = mesh.positions[i * 3 + 1];
    const z = mesh.positions[i * 3 + 2];
    const key = `${Math.round(x * 4000)},${Math.round(y * 4000)},${Math.round(z * 4000)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = positions.length / 3;
      map.set(key, id);
      positions.push(x, y, z);
      joints.push(mesh.joints[i * 4], mesh.joints[i * 4 + 1], mesh.joints[i * 4 + 2], mesh.joints[i * 4 + 3]);
      weights.push(mesh.weights[i * 4], mesh.weights[i * 4 + 1], mesh.weights[i * 4 + 2], mesh.weights[i * 4 + 3]);
    }
    remap[i] = id;
  }
  const kept = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = remap[mesh.indices[i]];
    const b = remap[mesh.indices[i + 1]];
    const c = remap[mesh.indices[i + 2]];
    if (a === b || b === c || c === a) continue;
    kept.push(a, b, c);
  }
  return {
    positions: Float32Array.from(positions),
    joints: Uint8Array.from(joints),
    weights: Float32Array.from(weights),
    indices: Uint32Array.from(kept),
  };
}

function computeNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    normals[a] += nx; normals[a + 1] += ny; normals[a + 2] += nz;
    normals[b] += nx; normals[b + 1] += ny; normals[b + 2] += nz;
    normals[c] += nx; normals[c + 1] += ny; normals[c + 2] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len < 1e-8) { normals[i + 1] = 1; continue; }
    normals[i] /= len; normals[i + 1] /= len; normals[i + 2] /= len;
  }
  return normals;
}

function offsetAlongNormals(mesh, distance) {
  const normals = computeNormals(mesh.positions, mesh.indices);
  const positions = new Float32Array(mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] += normals[i] * distance;
    positions[i + 1] += normals[i + 1] * distance;
    positions[i + 2] += normals[i + 2] * distance;
  }
  return { ...mesh, positions, normals };
}

function shell(prims, kinds, distance) {
  const parts = prims.filter((prim) => kinds.includes(prim.kind));
  if (parts.length === 0) throw new Error(`missing region ${kinds.join(',')}`);
  return offsetAlongNormals(weld(merge(parts)), distance);
}

function splitTriangles(mesh, keep) {
  const yes = [];
  const no = [];
  const p = mesh.positions;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i];
    const b = mesh.indices[i + 1];
    const c = mesh.indices[i + 2];
    const cx = (p[a * 3] + p[b * 3] + p[c * 3]) / 3;
    const cy = (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3;
    const cz = (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3;
    const nx = mesh.normals[a * 3] + mesh.normals[b * 3] + mesh.normals[c * 3];
    const ny = mesh.normals[a * 3 + 1] + mesh.normals[b * 3 + 1] + mesh.normals[c * 3 + 1];
    const nz = mesh.normals[a * 3 + 2] + mesh.normals[b * 3 + 2] + mesh.normals[c * 3 + 2];
    const len = Math.hypot(nx, ny, nz) || 1;
    (keep({ x: cx, y: cy, z: cz }, { x: nx / len, y: ny / len, z: nz / len }) ? yes : no).push(a, b, c);
  }
  return {
    yes: { ...mesh, indices: Uint32Array.from(yes) },
    no: { ...mesh, indices: Uint32Array.from(no) },
  };
}

function compact(mesh, indices) {
  const used = new Map();
  const positions = [];
  const normals = [];
  const joints = [];
  const weights = [];
  const out = [];
  for (const index of indices) {
    let id = used.get(index);
    if (id === undefined) {
      id = positions.length / 3;
      used.set(index, id);
      positions.push(mesh.positions[index * 3], mesh.positions[index * 3 + 1], mesh.positions[index * 3 + 2]);
      normals.push(mesh.normals[index * 3], mesh.normals[index * 3 + 1], mesh.normals[index * 3 + 2]);
      joints.push(mesh.joints[index * 4], mesh.joints[index * 4 + 1], mesh.joints[index * 4 + 2], mesh.joints[index * 4 + 3]);
      weights.push(mesh.weights[index * 4], mesh.weights[index * 4 + 1], mesh.weights[index * 4 + 2], mesh.weights[index * 4 + 3]);
    }
    out.push(id);
  }
  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    joints: Uint8Array.from(joints),
    weights: Float32Array.from(weights),
    indices: Uint32Array.from(out),
  };
}

function simplify(mesh, ratio, error, lockBorder) {
  if (mesh.indices.length < 150) return compact(mesh, mesh.indices);
  const target = Math.max(36, Math.floor(mesh.indices.length * ratio / 3) * 3);
  const flags = lockBorder ? ['LockBorder'] : [];
  const [next] = MeshoptSimplifier.simplify(mesh.indices, mesh.positions, 3, target, error, flags);
  return compact(mesh, next);
}

function rigidMesh(positions, indices, joint) {
  const count = positions.length / 3;
  const joints = new Uint8Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    joints[i * 4] = joint;
    weights[i * 4] = 1;
  }
  const indexArray = Uint32Array.from(indices);
  return {
    positions: Float32Array.from(positions),
    normals: computeNormals(Float32Array.from(positions), indexArray),
    joints,
    weights,
    indices: indexArray,
  };
}

function cone(base, height, radius, segments, joint) {
  const positions = [base[0], base[1] + height, base[2]];
  const indices = [];
  for (let i = 0; i < segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    positions.push(base[0] + Math.cos(angle) * radius, base[1], base[2] + Math.sin(angle) * radius);
    const a = 1 + i;
    const b = 1 + ((i + 1) % segments);
    indices.push(0, b, a);
  }
  return rigidMesh(positions, indices, joint);
}

function mergeGeoms(parts) {
  return parts.reduce((acc, part) => {
    const base = acc.positions.length / 3;
    const positions = new Float32Array(acc.positions.length + part.positions.length);
    const normals = new Float32Array(acc.normals.length + part.normals.length);
    const joints = new Uint8Array(acc.joints.length + part.joints.length);
    const weights = new Float32Array(acc.weights.length + part.weights.length);
    const indices = new Uint32Array(acc.indices.length + part.indices.length);
    positions.set(acc.positions); positions.set(part.positions, acc.positions.length);
    normals.set(acc.normals); normals.set(part.normals, acc.normals.length);
    joints.set(acc.joints); joints.set(part.joints, acc.joints.length);
    weights.set(acc.weights); weights.set(part.weights, acc.weights.length);
    indices.set(acc.indices);
    for (let i = 0; i < part.indices.length; i++) indices[acc.indices.length + i] = part.indices[i] + base;
    return { positions, normals, joints, weights, indices };
  });
}

function highest(mesh) {
  let best = [0, -Infinity, 0];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    if (mesh.positions[i + 1] > best[1]) best = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]];
  }
  return best;
}

function spikes(hood, joint) {
  const top = highest(hood);
  const specs = [
    { at: [top[0], top[1] + 0.012, top[2] + 0.045], height: 0.16, radius: 0.032 },
    { at: [top[0] + 0.055, top[1], top[2] - 0.005], height: 0.12, radius: 0.028 },
    { at: [top[0] - 0.055, top[1], top[2] - 0.005], height: 0.12, radius: 0.028 },
  ];
  return mergeGeoms(specs.map((spec) => cone(spec.at, spec.height, spec.radius, 7, joint)));
}

function backPoint(prims) {
  const shorts = prims.filter((prim) => prim.kind === 'shorts');
  let best = null;
  let bestZ = Infinity;
  for (const prim of shorts) {
    for (let i = 0; i < prim.positions.length; i += 3) {
      const x = prim.positions[i];
      const y = prim.positions[i + 1];
      const z = prim.positions[i + 2];
      if (Math.abs(x) > 0.05) continue;
      if (z < bestZ) { bestZ = z; best = [x, y, z]; }
    }
  }
  if (!best) throw new Error('no tail anchor');
  return best;
}

function tube(start, direction, length, r0, r1, rings, sides, joint) {
  const dir = normalize(direction);
  const up = Math.abs(dir[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize(cross(dir, up));
  const lift = normalize(cross(side, dir));
  const positions = [];
  const indices = [];
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const radius = r0 + (r1 - r0) * t;
    const origin = [
      start[0] + dir[0] * length * t,
      start[1] + dir[1] * length * t,
      start[2] + dir[2] * length * t,
    ];
    for (let s = 0; s < sides; s++) {
      const angle = (s / sides) * Math.PI * 2;
      positions.push(
        origin[0] + (side[0] * Math.cos(angle) + lift[0] * Math.sin(angle)) * radius,
        origin[1] + (side[1] * Math.cos(angle) + lift[1] * Math.sin(angle)) * radius,
        origin[2] + (side[2] * Math.cos(angle) + lift[2] * Math.sin(angle)) * radius,
      );
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let s = 0; s < sides; s++) {
      const a = ring * sides + s;
      const b = ring * sides + ((s + 1) % sides);
      const c = (ring + 1) * sides + s;
      const d = (ring + 1) * sides + ((s + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }
  return rigidMesh(positions, indices, joint);
}

function normalize(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function nearestWeights(mesh, point) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const d = (mesh.positions[i] - point[0]) ** 2
      + (mesh.positions[i + 1] - point[1]) ** 2
      + (mesh.positions[i + 2] - point[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = i / 3; }
  }
  return {
    joints: mesh.joints.slice(best * 4, best * 4 + 4),
    weights: mesh.weights.slice(best * 4, best * 4 + 4),
  };
}

function diamond(center, size, donor) {
  const [x, y, z] = center;
  const positions = [
    x, y + size, z + 0.012,
    x + size * 0.62, y, z + 0.012,
    x, y - size, z + 0.012,
    x - size * 0.62, y, z + 0.012,
    x, y, z + 0.02,
  ];
  const indices = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4];
  const influence = nearestWeights(donor, center);
  const joints = new Uint8Array(5 * 4);
  const weights = new Float32Array(5 * 4);
  for (let i = 0; i < 5; i++) {
    joints.set(influence.joints, i * 4);
    weights.set(influence.weights, i * 4);
  }
  const indexArray = Uint32Array.from(indices);
  return {
    positions: Float32Array.from(positions),
    normals: computeNormals(Float32Array.from(positions), indexArray),
    joints,
    weights,
    indices: indexArray,
  };
}

function chestPoint(mesh) {
  let best = null;
  let bestZ = -Infinity;
  const bounds = boundsOf(mesh.positions);
  const y0 = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.45;
  const y1 = bounds.min[1] + (bounds.max[1] - bounds.min[1]) * 0.75;
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const x = mesh.positions[i];
    const y = mesh.positions[i + 1];
    const z = mesh.positions[i + 2];
    if (Math.abs(x) > 0.04 || y < y0 || y > y1) continue;
    if (z > bestZ) { bestZ = z; best = [x, y, z]; }
  }
  if (!best) throw new Error('no chest point');
  return best;
}

function faceOf(prims) {
  const eyes = prims.find((prim) => prim.kind === 'eyes');
  if (!eyes) throw new Error('no eyes');
  const { min, max } = eyes.bounds;
  return {
    minY: min[1] - 0.08,
    maxY: max[1] + 0.015,
    minZ: min[2] - 0.03,
    halfX: Math.max(0.07, (max[0] - min[0]) * 0.95),
    browMinY: max[1] - 0.012,
    browMaxY: max[1] + 0.04,
    visorMinY: min[1] - 0.055,
    visorMaxY: max[1] + 0.012,
  };
}

function inWindow(c, n, face, minY, maxY) {
  return n.z > 0.18 && c.z > face.minZ && Math.abs(c.x) < face.halfX && c.y > minY && c.y < maxY;
}

function cylinder(base, height, radius, segments, joint) {
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < 2; ring++) {
    for (let step = 0; step < segments; step++) {
      const angle = (step / segments) * Math.PI * 2;
      positions.push(base[0] + Math.cos(angle) * radius, base[1] + height * ring, base[2] + Math.sin(angle) * radius);
    }
  }
  const bottom = positions.length / 3;
  positions.push(base[0], base[1], base[2]);
  const top = positions.length / 3;
  positions.push(base[0], base[1] + height, base[2]);
  for (let step = 0; step < segments; step++) {
    const a = step;
    const b = (step + 1) % segments;
    const c = segments + step;
    const d = segments + b;
    indices.push(a, c, b, b, c, d, bottom, b, a, top, c, d);
  }
  return rigidMesh(positions, indices, joint);
}

function sphere(center, radius, joint) {
  const stacks = 4;
  const slices = 6;
  const positions = [];
  const indices = [];
  for (let stack = 0; stack <= stacks; stack++) {
    const phi = (stack / stacks) * Math.PI;
    for (let slice = 0; slice < slices; slice++) {
      const theta = (slice / slices) * Math.PI * 2;
      positions.push(
        center[0] + radius * Math.sin(phi) * Math.cos(theta),
        center[1] + radius * Math.cos(phi),
        center[2] + radius * Math.sin(phi) * Math.sin(theta),
      );
    }
  }
  for (let stack = 0; stack < stacks; stack++) {
    for (let slice = 0; slice < slices; slice++) {
      const a = stack * slices + slice;
      const b = stack * slices + ((slice + 1) % slices);
      const c = a + slices;
      const d = b + slices;
      indices.push(a, c, b, b, c, d);
    }
  }
  return rigidMesh(positions, indices, joint);
}

function torus(center, major, minor, joint) {
  const rings = 8;
  const sides = 5;
  const positions = [];
  const indices = [];
  for (let ring = 0; ring < rings; ring++) {
    const u = (ring / rings) * Math.PI * 2;
    const cx = Math.cos(u) * major;
    const cz = Math.sin(u) * major;
    for (let side = 0; side < sides; side++) {
      const v = (side / sides) * Math.PI * 2;
      positions.push(
        center[0] + cx + Math.cos(u) * Math.sin(v) * minor,
        center[1] + Math.cos(v) * minor,
        center[2] + cz + Math.sin(u) * Math.sin(v) * minor,
      );
    }
  }
  for (let ring = 0; ring < rings; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side;
      const b = ring * sides + ((side + 1) % sides);
      const c = ((ring + 1) % rings) * sides + side;
      const d = ((ring + 1) % rings) * sides + ((side + 1) % sides);
      indices.push(a, c, b, b, c, d);
    }
  }
  return rigidMesh(positions, indices, joint);
}

function boxMesh(center, size, joint) {
  const [cx, cy, cz] = center;
  const hx = size[0] / 2;
  const hy = size[1] / 2;
  const hz = size[2] / 2;
  const positions = [
    cx - hx, cy - hy, cz - hz, cx + hx, cy - hy, cz - hz, cx + hx, cy + hy, cz - hz, cx - hx, cy + hy, cz - hz,
    cx - hx, cy - hy, cz + hz, cx + hx, cy - hy, cz + hz, cx + hx, cy + hy, cz + hz, cx - hx, cy + hy, cz + hz,
  ];
  const indices = [
    0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4,
    1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ];
  return rigidMesh(positions, indices, joint);
}

function disc(center, radius, joint) {
  const segments = 8;
  const positions = [center[0], center[1], center[2]];
  const indices = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    positions.push(center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius, center[2]);
    indices.push(0, 1 + ((step + 1) % segments), 1 + step);
  }
  return rigidMesh(positions, indices, joint);
}

function brim(center, inner, outer, joint) {
  const segments = 10;
  const positions = [];
  const indices = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    positions.push(center[0] + Math.cos(angle) * inner, center[1], center[2] + Math.sin(angle) * inner);
    positions.push(center[0] + Math.cos(angle) * outer, center[1], center[2] + Math.sin(angle) * outer);
  }
  for (let step = 0; step < segments; step++) {
    const a = step * 2;
    const b = a + 1;
    const c = ((step + 1) % segments) * 2;
    const d = c + 1;
    indices.push(a, b, d, a, d, c);
  }
  return rigidMesh(positions, indices, joint);
}

function coneAlong(base, tip, radius, segments, joint) {
  const axis = normalize([tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]]);
  const helper = Math.abs(axis[1]) > 0.85 ? [1, 0, 0] : [0, 1, 0];
  const side = normalize(cross(axis, helper));
  const lift = normalize(cross(side, axis));
  const positions = [...tip];
  const indices = [];
  for (let step = 0; step < segments; step++) {
    const angle = (step / segments) * Math.PI * 2;
    positions.push(
      base[0] + (side[0] * Math.cos(angle) + lift[0] * Math.sin(angle)) * radius,
      base[1] + (side[1] * Math.cos(angle) + lift[1] * Math.sin(angle)) * radius,
      base[2] + (side[2] * Math.cos(angle) + lift[2] * Math.sin(angle)) * radius,
    );
    indices.push(0, 1 + ((step + 1) % segments), 1 + step);
  }
  return rigidMesh(positions, indices, joint);
}

function stamp(mesh, donor, point) {
  const influence = nearestWeights(donor, point);
  const joints = new Uint8Array(mesh.joints.length);
  const weights = new Float32Array(mesh.weights.length);
  for (let i = 0; i < joints.length; i += 4) {
    joints.set(influence.joints, i);
    weights.set(influence.weights, i);
  }
  return { ...mesh, joints, weights };
}

function jointCentroid(prims, joint) {
  const sum = [0, 0, 0];
  let count = 0;
  for (const prim of prims) {
    for (let vertex = 0; vertex < prim.positions.length / 3; vertex++) {
      if (dominantJoint(prim, vertex) !== joint) continue;
      sum[0] += prim.positions[vertex * 3];
      sum[1] += prim.positions[vertex * 3 + 1];
      sum[2] += prim.positions[vertex * 3 + 2];
      count += 1;
    }
  }
  if (count === 0) return null;
  return [sum[0] / count, sum[1] / count, sum[2] / count];
}

function yBands(mesh, count) {
  const bounds = boundsOf(mesh.positions);
  const span = bounds.max[1] - bounds.min[1] || 1;
  const out = [];
  for (let band = 0; band < count; band++) {
    const y0 = bounds.min[1] + span * (band / count);
    const y1 = bounds.min[1] + span * ((band + 1) / count);
    const slice = splitTriangles(mesh, (point) => point.y >= y0 && (band === count - 1 || point.y < y1)).yes;
    if (slice.indices.length >= 3) out.push(slice);
  }
  return out;
}

function part(name, mesh, color, material, ratio = 0.3, error = 0.008, lockBorder = false) {
  if (mesh.indices.length < 3) throw new Error(`empty part ${name}`);
  const simplified = simplify(mesh, ratio, error, lockBorder);
  if (simplified.indices.length < 3) throw new Error(`simplified away ${name}`);
  return { name, mesh: simplified, color, ...material };
}

function wear(name, mesh, color, material, ratio = 0.12, error = 0.02, lockBorder = false) {
  return part(name, mesh, color, material, ratio, error, lockBorder);
}

function bootPair(boots, sole, color) {
  return [
    wear('boot', boots, color, BOOT, 0.5, 0.004),
    wear('sole', sole, SOLE, SOLE_MAT, 0.6, 0.003),
  ];
}

function recipes(body) {
  const face = faceOf(body.prims);
  const headJoint = body.jointIndex('Head');
  const hipJoint = body.jointIndex('Hips');
  const neckJoint = body.jointIndex('Neck');
  const suit = shell(body.prims, ['shirt', 'shorts', 'socks', 'arm', 'thigh'], 0.012);
  const boots = shell(body.prims, ['boots'], 0.01);
  const sole = shell(body.prims, ['sole'], 0.004);
  const head = shell(body.prims, ['head'], 0.018);
  const hood = splitTriangles(head, (c, n) => inWindow(c, n, face, face.minY, face.maxY)).no;
  const plate = shell(body.prims, ['shirt', 'arm'], 0.016);
  const legs = shell(body.prims, ['shorts', 'thigh', 'socks'], 0.012);
  const shirt = shell(body.prims, ['shirt'], 0.012);
  const arms = shell(body.prims, ['arm'], 0.01);
  const tabardShell = shell(body.prims, ['shirt', 'shorts'], 0.028);
  const tabard = splitTriangles(tabardShell, (c, n) => n.z > 0.35 && Math.abs(c.x) < 0.09 && c.y > face.minY - 0.55).yes;
  const helmet = splitTriangles(shell(body.prims, ['head'], 0.022), (c, n) => inWindow(c, n, face, face.visorMinY, face.visorMaxY)).no;
  const brow = splitTriangles(shell(body.prims, ['head'], 0.02), (c, n) => inWindow(c, n, face, face.browMinY, face.browMaxY)).yes;
  const belly = splitTriangles(suit, (c, n) => n.z > 0.4 && Math.abs(c.x) < 0.07 && c.y > -0.02 && c.y < 0.42).yes;
  const cloth = splitTriangles(suit, (c, n) => n.z > 0.4 && Math.abs(c.x) < 0.07 && c.y > -0.02 && c.y < 0.42).no;
  const eyes = body.prims.find((prim) => prim.kind === 'eyes');
  const eyeY = (eyes.bounds.min[1] + eyes.bounds.max[1]) / 2;
  const eyeZ = eyes.bounds.max[2] + 0.015;
  const eyeX = Math.max(0.035, (eyes.bounds.max[0] - eyes.bounds.min[0]) * 0.28);
  const crown = extremePoint(body.prims, 'head', 1, 1);
  const neck = [0, face.minY - 0.02, eyeZ - 0.04];
  const chest = chestPoint(suit);
  const back = backAnchor(body.prims);
  const bands = yBands(shirt, 6);
  const stripeLight = mergeGeoms(bands.filter((_, index) => index % 2 === 0));
  const stripeDark = mergeGeoms(bands.filter((_, index) => index % 2 === 1));
  const waist = splitTriangles(tabard, (point) => point.y > chest[1] - 0.08).yes;
  const beard = splitTriangles(head, (c, n) => n.z > 0.2 && c.y < face.minY + 0.015 && c.y > face.minY - 0.08 && Math.abs(c.x) < face.halfX * 0.75).yes;
  const beardMesh = beard.indices.length >= 12
    ? beard
    : stamp(boxMesh([0, face.minY - 0.03, eyeZ], [0.08, 0.045, 0.035], headJoint), suit, chest);
  const mask = splitTriangles(shell(body.prims, ['head'], 0.02), (c, n) => {
    const eyesOpen = inWindow(c, n, face, face.visorMinY, face.visorMaxY);
    const mouthOpen = n.z > 0.2 && c.z > face.minZ && Math.abs(c.x) < face.halfX * 0.45 && c.y < face.visorMinY && c.y > face.minY;
    return eyesOpen || mouthOpen;
  }).no;
  const leftArm = jointCentroid(body.prims, body.jointIndex('LowerArm_L'));
  const rightArm = jointCentroid(body.prims, body.jointIndex('LowerArm_R'));
  const thigh = jointCentroid(body.prims, body.jointIndex('UpperLeg_L'));
  const tailAnchor = backPoint(body.prims);
  const plain = (color) => bootPair(boots, sole, color);
  const suitPart = (color, material = CLOTH) => wear('suit', suit, color, material);
  const browPart = (color) => wear('brow', brow, color, { roughness: 0.6, metalness: 0.05 }, 0.55, 0.006, true);
  const rings = (color, name) => {
    if (!leftArm || !rightArm) throw new Error(`missing forearm for ${name}`);
    return wear(name, mergeGeoms([
      torus(leftArm, 0.038, 0.012, body.jointIndex('LowerArm_L')),
      torus(rightArm, 0.038, 0.012, body.jointIndex('LowerArm_R')),
    ]), color, CLOTH, 1, 1);
  };
  const spineJoint = body.jointIndex('Spine2');
  return {
    'spike-hood': [
      wear('suit', cloth, GREEN, CLOTH),
      wear('belly', belly, BELLY, CLOTH, 0.35, 0.012),
      wear('hood', hood, GREEN, CLOTH, 0.32, 0.01, true),
      wear('spike', spikes(hood, headJoint), SPIKE, CLOTH, 1, 1),
      wear('tail', tube([tailAnchor[0], tailAnchor[1], tailAnchor[2] - 0.02], [0, -0.28, -1], 0.34, 0.045, 0.012, 6, 6, hipJoint), GREEN, CLOTH, 1, 1),
      ...plain(DINO_BOOT),
    ],
    'keep-guard': [
      wear('plate', plate, PLATE_COLOR, PLATE),
      wear('legs', legs, CHAIN_COLOR, CHAIN, 0.14, 0.018),
      wear('tabard', tabard, TABARD, CLOTH, 0.28, 0.012),
      wear('mark', diamond(chestPoint(tabard), 0.045, tabard), MARK, { roughness: 0.4, metalness: 0.35 }, 1, 1),
      wear('helmet', helmet, HELMET, PLATE, 0.32, 0.01, true),
      ...plain(KNIGHT_BOOT),
    ],
    'night-glider': [
      suitPart(NIGHT),
      browPart(BROW),
      ...plain(NIGHT_BOOT),
    ],
    'kitchen-whites': [
      suitPart(WHITE),
      wear('apron', tabard, APRON, CLOTH, 0.28, 0.012),
      wear('toque', mergeGeoms([
        cylinder(crown, 0.16, 0.058, 8, headJoint),
        cylinder([crown[0], crown[1] + 0.14, crown[2]], 0.07, 0.078, 8, headJoint),
      ]), WHITE, CLOTH, 1, 1),
      ...plain(WHITE),
    ],
    'match-official': [
      suitPart(BLACK),
      wear('whistle', sphere([neck[0] + 0.04, neck[1], neck[2]], 0.018, neckJoint), hex('#C5C8CE'), { roughness: 0.35, metalness: 0.4 }, 1, 1),
      wear('card-yellow', stamp(boxMesh([chest[0] - 0.06, chest[1] - 0.02, chest[2] + 0.02], [0.04, 0.06, 0.006], 0), suit, chest), CARD_YELLOW, CLOTH, 1, 1),
      wear('card-red', stamp(boxMesh([chest[0] + 0.06, chest[1] - 0.05, chest[2] + 0.02], [0.04, 0.06, 0.006], 0), suit, chest), CARD_RED, CLOTH, 1, 1),
      ...plain(BLACK),
    ],
    'snow-friend': [
      suitPart(SNOW),
      wear('scarf', torus([0, neck[1], 0.02], 0.09, 0.022, neckJoint), SCARF, CLOTH, 1, 1),
      wear('button', mergeGeoms([0, 1, 2].map((step) => sphere([chest[0], chest[1] - step * 0.07, chest[2] + 0.012], 0.016, spineJoint))), BUTTON, CLOTH, 1, 1),
      wear('carrot', coneAlong([0, eyeY - 0.05, eyeZ], [0, eyeY - 0.06, eyeZ + 0.07], 0.016, 6, headJoint), CARROT, CLOTH, 1, 1),
      ...plain(SNOW),
    ],
    'gold-legend': [
      suitPart(GOLD, GOLD_MAT),
      ...plain(GOLD_BOOT),
    ],
    'street-hero': [
      suitPart(TEAL),
      browPart(CORAL),
      rings(CORAL, 'wristband'),
      ...plain(hex('#163E3E')),
    ],
    alien: [
      suitPart(ALIEN_GREEN),
      browPart(ALIEN_DARK),
      wear('antenna', mergeGeoms([
        cylinder([crown[0] - 0.04, crown[1], crown[2]], 0.14, 0.008, 5, headJoint),
        cylinder([crown[0] + 0.04, crown[1], crown[2]], 0.14, 0.008, 5, headJoint),
        sphere([crown[0] - 0.04, crown[1] + 0.15, crown[2]], 0.02, headJoint),
        sphere([crown[0] + 0.04, crown[1] + 0.15, crown[2]], 0.02, headJoint),
      ]), ALIEN_DARK, CLOTH, 1, 1),
      ...plain(ALIEN_DARK),
    ],
    spaceman: [
      suitPart(SPACE),
      wear('pack', stamp(boxMesh([back[0], back[1] + 0.02, back[2] - 0.08], [0.16, 0.22, 0.1], 0), suit, back), PACK, CLOTH, 1, 1),
      wear('visor', stamp(boxMesh([0, eyeY + 0.07, eyeZ], [0.12, 0.045, 0.012], headJoint), suit, chest), VISOR, { roughness: 0.25, metalness: 0.15 }, 1, 1),
      ...plain(SPACE),
    ],
    'night-wrap': [
      suitPart(NINJA),
      wear('hood', hood, NINJA, CLOTH, 0.32, 0.01, true),
      browPart(NINJA_BAND),
      rings(NINJA_BAND, 'tape'),
      ...plain(NINJA),
    ],
    'deck-hand': [
      wear('shirt-light', stripeLight, PIRATE_LIGHT, CLOTH, 0.18, 0.018),
      wear('shirt-dark', stripeDark, PIRATE_DARK, CLOTH, 0.18, 0.018),
      wear('sleeve', arms, PIRATE_LIGHT, CLOTH, 0.1, 0.02),
      wear('legs', legs, WAIST, CLOTH, 0.1, 0.02),
      wear('waistcoat', waist, WAIST, CLOTH, 0.25, 0.014),
      wear('bandana', hood, PIRATE_DARK, CLOTH, 0.2, 0.012, true),
      wear('hat', mergeGeoms([
        cylinder([crown[0], crown[1] + 0.02, crown[2]], 0.07, 0.05, 8, headJoint),
        brim([crown[0], crown[1] + 0.02, crown[2]], 0.05, 0.13, headJoint),
      ]), BLACK, CLOTH, 1, 1),
      wear('patch', disc([-eyeX, eyeY, eyeZ], 0.022, headJoint), BLACK, CLOTH, 1, 1),
      ...plain(BLACK),
    ],
    'secret-agent': [
      suitPart(AGENT),
      wear('tie', stamp(boxMesh([chest[0], chest[1] - 0.06, chest[2] + 0.016], [0.028, 0.16, 0.008], 0), suit, chest), WHITE, CLOTH, 1, 1),
      wear('glasses', mergeGeoms([
        torus([-eyeX, eyeY, eyeZ], 0.02, 0.004, headJoint),
        torus([eyeX, eyeY, eyeZ], 0.02, 0.004, headJoint),
        boxMesh([0, eyeY, eyeZ], [0.045, 0.006, 0.006], headJoint),
      ]), GLASS, { roughness: 0.3, metalness: 0.2 }, 1, 1),
      ...plain(AGENT),
    ],
    'ring-mask': [
      wear('plate', plate, LUCHA_RED, CLOTH),
      wear('legs', legs, LUCHA_TEAL, CLOTH, 0.14, 0.018),
      wear('mask', mask, LUCHA_TEAL, CLOTH, 0.4, 0.008, true),
      wear('dot', mergeGeoms([
        sphere([-0.035, eyeY - 0.03, eyeZ], 0.012, headJoint),
        sphere([0.035, eyeY - 0.03, eyeZ], 0.012, headJoint),
      ]), LUCHA_DOT, CLOTH, 1, 1),
      wear('cape', capeSheet(back, suit), LUCHA_RED, CLOTH, 1, 1),
      ...plain(BLACK),
    ],
    'stage-jacket': [
      wear('jacket', plate, ROCK, LEATHER),
      wear('legs', legs, hex('#1A1612'), CLOTH, 0.16, 0.016),
      wear('shade', mergeGeoms([
        disc([-eyeX, eyeY, eyeZ], 0.02, headJoint),
        disc([eyeX, eyeY, eyeZ], 0.02, headJoint),
        boxMesh([0, eyeY, eyeZ], [0.04, 0.006, 0.006], headJoint),
      ]), GLASS, { roughness: 0.2, metalness: 0.1 }, 1, 1),
      wear('quiff', coneAlong([0, crown[1] - 0.03, crown[2] + 0.05], [0, crown[1] + 0.12, crown[2] - 0.02], 0.042, 6, headJoint), QUIFF, CLOTH, 1, 1),
      ...plain(hex('#1A1612')),
    ],
    seventies: [
      wear('shirt', shirt, ORANGE, CLOTH, 0.2, 0.016),
      wear('sleeve', arms, ORANGE, CLOTH, 0.2, 0.016),
      wear('legs', legs, YELLOW, CLOTH, 0.16, 0.016),
      browPart(WHITE),
      wear('moustache', stamp(boxMesh([0, eyeY - 0.055, eyeZ + 0.005], [0.07, 0.016, 0.02], headJoint), suit, chest), MOUSTACHE, CLOTH, 1, 1),
      ...plain(TAN_BOOT),
    ],
    'north-pole': [
      suitPart(SANTA),
      wear('hat', coneAlong(crown, [crown[0] + 0.1, crown[1] + 0.2, crown[2]], 0.07, 8, headJoint), SANTA, CLOTH, 1, 1),
      wear('pom', sphere([crown[0] + 0.1, crown[1] + 0.21, crown[2]], 0.028, headJoint), WHITE, CLOTH, 1, 1),
      wear('brim', brim(crown, 0.02, 0.095, headJoint), WHITE, CLOTH, 1, 1),
      wear('beard', beardMesh, WHITE, CLOTH, 0.5, 0.008, true),
      ...plain(SANTA_BOOT),
    ],
    'grey-ghoul': [
      suitPart(ZOMBIE),
      wear('wrap', mergeGeoms([
        ...(leftArm ? [torus(leftArm, 0.04, 0.012, body.jointIndex('LowerArm_L')), torus([leftArm[0], leftArm[1] - 0.04, leftArm[2]], 0.036, 0.01, body.jointIndex('LowerArm_L'))] : []),
        ...(rightArm ? [torus(rightArm, 0.04, 0.012, body.jointIndex('LowerArm_R'))] : []),
        ...(thigh ? [torus(thigh, 0.07, 0.014, body.jointIndex('UpperLeg_L'))] : []),
      ]), WRAP, CLOTH, 1, 1),
      ...plain(ZOMBIE_BOOT),
    ],
  };
}

function extremePoint(prims, kind, axis, dir) {
  let best = null;
  let score = dir > 0 ? -Infinity : Infinity;
  for (const prim of prims) {
    if (prim.kind !== kind) continue;
    for (let i = 0; i < prim.positions.length; i += 3) {
      const value = prim.positions[i + axis];
      if ((dir > 0 && value > score) || (dir < 0 && value < score)) {
        score = value;
        best = [prim.positions[i], prim.positions[i + 1], prim.positions[i + 2]];
      }
    }
  }
  if (!best) throw new Error(`no ${kind} point`);
  return best;
}

function backAnchor(prims) {
  let best = null;
  let bestZ = Infinity;
  for (const prim of prims) {
    if (prim.kind !== 'shirt') continue;
    for (let i = 0; i < prim.positions.length; i += 3) {
      if (Math.abs(prim.positions[i]) > 0.06) continue;
      const z = prim.positions[i + 2];
      if (z < bestZ) {
        bestZ = z;
        best = [prim.positions[i], prim.positions[i + 1], z];
      }
    }
  }
  if (!best) throw new Error('no back anchor');
  return best;
}

function capeSheet(anchor, donor) {
  const cols = 4;
  const rows = 3;
  const positions = [];
  const indices = [];
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= cols; col++) {
      const u = col / cols - 0.5;
      const v = row / rows;
      positions.push(anchor[0] + u * 0.22, anchor[1] - v * 0.26, anchor[2] - 0.03 - v * 0.05);
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const a = row * (cols + 1) + col;
      const b = a + 1;
      const d = a + cols + 1;
      const e = d + 1;
      indices.push(a, d, b, b, d, e);
    }
  }
  return stamp(rigidMesh(positions, indices, 0), donor, anchor);
}

function dominantJoint(prim, vertex) {
  let best = 0;
  let weight = -1;
  for (let influence = 0; influence < 4; influence++) {
    const value = prim.weights[vertex * 4 + influence];
    if (value > weight) {
      weight = value;
      best = prim.joints[vertex * 4 + influence];
    }
  }
  return best;
}

/** The female body keeps arms and legs in one skin primitive. Split it by joint. */
function splitLimbs(prims, jointNames) {
  const arms = new Set(['UpperArm_L', 'LowerArm_L', 'Hand_L', 'UpperArm_R', 'LowerArm_R', 'Hand_R']);
  const legs = new Set(['UpperLeg_L', 'LowerLeg_L', 'UpperLeg_R', 'LowerLeg_R', 'Hips']);
  const next = [];
  for (const prim of prims) {
    if (prim.kind !== 'thigh' && prim.kind !== 'arm' && prim.kind !== 'skin') {
      next.push(prim);
      continue;
    }
    const groups = { arm: [], thigh: [] };
    for (let i = 0; i < prim.indices.length; i += 3) {
      const ids = [prim.indices[i], prim.indices[i + 1], prim.indices[i + 2]];
      const names = ids.map((id) => jointNames[dominantJoint(prim, id)] ?? '');
      const armVotes = names.filter((name) => arms.has(name)).length;
      const bucket = armVotes >= 2 ? 'arm' : 'thigh';
      if (armVotes < 2 && !names.some((name) => legs.has(name)) && prim.kind === 'arm') groups.arm.push(...ids);
      else groups[bucket].push(...ids);
    }
    for (const [kind, indices] of Object.entries(groups)) {
      if (indices.length >= 3) next.push({ ...prim, kind, indices: Uint32Array.from(indices) });
    }
  }
  return next;
}

async function loadBody(io, file) {
  const doc = await io.read(file);
  const skin = doc.getRoot().listSkins()[0];
  const jointNames = skin.listJoints().map((joint) => joint.getName());
  const mesh = doc.getRoot().listMeshes()[0];
  const prims = [];
  for (const prim of mesh.listPrimitives()) {
    const positions = decodeVec(prim.getAttribute('POSITION'));
    const weightAcc = prim.getAttribute('WEIGHTS_0');
    const weights = decodeVec(weightAcc);
    const jointRaw = prim.getAttribute('JOINTS_0').getArray();
    const count = positions.length / 3;
    const indexAcc = prim.getIndices();
    const indices = indexAcc ? Uint32Array.from(indexAcc.getArray()) : Uint32Array.from({ length: count }, (_, i) => i);
    const bounds = boundsOf(positions);
    const name = prim.getMaterial()?.getName() ?? '';
    prims.push({
      kind: classify(name, bounds),
      name,
      positions,
      joints: Uint8Array.from(jointRaw),
      weights,
      indices,
      bounds,
    });
  }
  const limbs = splitLimbs(prims, jointNames);
  const head = boundsOf(limbs.find((prim) => prim.kind === 'head').positions);
  if (head.max[1] > 5) throw new Error(`positions were not decoded (${head.max[1]})`);
  return {
    skin,
    jointNames,
    prims: limbs,
    jointIndex(name) {
      const index = jointNames.indexOf(name);
      if (index < 0) throw new Error(`missing joint ${name}`);
      return index;
    },
  };
}

function copySkin(doc, buffer, scene, srcSkin) {
  const srcJoints = srcSkin.listJoints();
  const needed = new Set();
  for (const joint of srcJoints) {
    let node = joint;
    while (node) {
      needed.add(node);
      node = node.getParentNode();
    }
  }
  const map = new Map();
  for (const src of needed) {
    const node = doc.createNode(src.getName() || 'armature');
    const t = src.getTranslation();
    const r = src.getRotation();
    const s = src.getScale();
    node.setTranslation([t[0], t[1], t[2]]);
    node.setRotation([r[0], r[1], r[2], r[3]]);
    node.setScale([s[0], s[1], s[2]]);
    map.set(src, node);
  }
  for (const src of needed) {
    const parent = src.getParentNode();
    const dst = map.get(src);
    if (parent && map.has(parent)) map.get(parent).addChild(dst);
    else scene.addChild(dst);
  }
  const skin = doc.createSkin('OutfitSkin');
  const ibm = new Float32Array(srcSkin.getInverseBindMatrices().getArray());
  skin.setInverseBindMatrices(doc.createAccessor('IBM').setType('MAT4').setArray(ibm).setBuffer(buffer));
  for (const joint of srcJoints) skin.addJoint(map.get(joint));
  return skin;
}

function addPart(doc, buffer, mesh, partDef) {
  const src = partDef.mesh;
  const material = doc.createMaterial(partDef.name)
    .setBaseColorFactor(partDef.color)
    .setRoughnessFactor(partDef.roughness)
    .setMetallicFactor(partDef.metalness)
    .setDoubleSided(/^(spike|tail|mark|hat|brim|cape|shade|tie|moustache|pom|beard|wrap|apron|visor|whistle|toque)$/.test(partDef.name) || partDef.name.startsWith('card'));
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(src.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(src.normals).setBuffer(buffer))
    .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(src.joints).setBuffer(buffer))
    .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(src.weights).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(src.indices).setBuffer(buffer))
    .setMaterial(material);
  mesh.addPrimitive(prim);
}

async function writeOutfit(io, srcSkin, id, bodyName, parts) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene();
  const skin = copySkin(doc, buffer, scene, srcSkin);
  const mesh = doc.createMesh(id);
  for (const piece of parts) addPart(doc, buffer, mesh, piece);
  const node = doc.createNode(id).setMesh(mesh).setSkin(skin);
  scene.addChild(node);
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({
    method: EXTMeshoptCompression.EncoderMethod.QUANTIZE,
  });
  const file = `${OUT_DIR}/${id}-${bodyName}.glb`;
  await io.write(file, doc);
  const size = statSync(file).size;
  const tris = parts.reduce((sum, piece) => sum + piece.mesh.indices.length / 3, 0);
  console.log(`${id} ${bodyName} ${(size / 1024).toFixed(1)}KB ${tris.toFixed(0)} tris`);
  if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes`);
}

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO()
  .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu, KHRMaterialsClearcoat])
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

const ALL_IDS = [
  'spike-hood', 'keep-guard', 'night-glider', 'kitchen-whites', 'match-official', 'snow-friend',
  'gold-legend', 'street-hero', 'alien', 'spaceman', 'night-wrap', 'deck-hand', 'secret-agent',
  'ring-mask', 'stage-jacket', 'seventies', 'north-pole', 'grey-ghoul',
];
const requested = process.argv.slice(2);
const ids = requested.length > 0 ? requested : ALL_IDS;
mkdirSync(OUT_DIR, { recursive: true });
for (const [bodyName, file] of Object.entries(BODIES)) {
  const body = await loadBody(io, file);
  const counts = new Map();
  for (const prim of body.prims) counts.set(prim.kind, (counts.get(prim.kind) ?? 0) + prim.indices.length / 3);
  console.log(bodyName, Object.fromEntries(counts));
  const built = recipes(body);
  for (const id of ids) {
    const parts = built[id];
    if (!parts) throw new Error(`unknown outfit ${id}`);
    await writeOutfit(io, body.skin, id, bodyName, parts);
  }
}
