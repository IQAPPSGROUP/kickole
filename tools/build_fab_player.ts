/**
 * Build the runtime footballer GLBs from the purchased Fab characters.
 *
 * Fab Standard licence, Personal tier, licensed to Rob Stancombe t/a IQ Apps Group.
 * The raw download is not in the repo. Set FAB_PLAYER_SRC to the folder that
 * contains source_4.zip (male Godot rig) and source.zip (female FBX rig):
 *
 *   FAB_PLAYER_SRC=/path/to/kickole-fab-models npm run build:player
 *
 * Blender writes an intermediate GLB (tools/prepare_fab_player.py). This script
 * rebakes that mesh onto the contract skeleton, samples the existing kick, idle,
 * miss and celebrate poses, and encodes KTX2 + meshopt. Only the optimised GLBs
 * under public/models are committed.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO } from '@gltf-transform/core';
import type { Material, Node as GltfNode, Primitive as GltfPrim } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat, KHRTextureBasisu } from '@gltf-transform/extensions';
import { dedup, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { GameEngine } from '../src/engine/engine.ts';
import type { Side } from '../src/engine/config.ts';
import { computePose, type Pose } from '../src/scene/pose.ts';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PREP = process.env.FAB_PREP_DIR ?? join(tmpdir(), 'fab', 'prepared');
const TOKTX = process.env.TOKTX ?? '/tmp/ktx/KTX-Software-4.4.0-Linux-x86_64/bin/toktx';
const PUBLIC = join(ROOT, '../public/models');

const JOINT_ORDER = [
  'Root', 'Hips', 'Spine', 'Spine2', 'Neck', 'Head',
  'UpperArm_L', 'LowerArm_L', 'Hand_L',
  'UpperArm_R', 'LowerArm_R', 'Hand_R',
  'UpperLeg_L', 'LowerLeg_L', 'Foot_L', 'Toe_L',
  'UpperLeg_R', 'LowerLeg_R', 'Foot_R', 'Toe_R',
] as const;

const PARENT: Record<string, string> = {
  Hips: 'Root',
  Spine: 'Hips',
  Spine2: 'Spine',
  Neck: 'Spine2',
  Head: 'Neck',
  UpperArm_L: 'Spine2',
  LowerArm_L: 'UpperArm_L',
  Hand_L: 'LowerArm_L',
  UpperArm_R: 'Spine2',
  LowerArm_R: 'UpperArm_R',
  Hand_R: 'LowerArm_R',
  UpperLeg_L: 'Hips',
  LowerLeg_L: 'UpperLeg_L',
  Foot_L: 'LowerLeg_L',
  Toe_L: 'Foot_L',
  UpperLeg_R: 'Hips',
  LowerLeg_R: 'UpperLeg_R',
  Foot_R: 'LowerLeg_R',
  Toe_R: 'Foot_R',
};

const ROLES = ['Skin', 'Hair', 'Eyes', 'InnerMouth', 'Shirt', 'Shirt_Trim', 'Shorts', 'Socks', 'Boots', 'Boots_Sole'] as const;
type Role = (typeof ROLES)[number];

interface Prim {
  role: Role;
  image: Buffer;
  pos: Float32Array;
  nrm: Float32Array;
  uv: Float32Array;
  joints: Uint16Array;
  weights: Float32Array;
  idx: Uint32Array;
}

function prepareSources() {
  if (process.env.SKIP_PREP === '1' && existsSync(join(PREP, 'male.glb')) && existsSync(join(PREP, 'female.glb'))) return;
  const src = process.env.FAB_PLAYER_SRC ?? '/cursor/stores/bot/kickole-fab-models';
  if (!existsSync(join(src, 'source_4.zip')) || !existsSync(join(src, 'source.zip'))) {
    throw new Error(`Fab sources not found in ${src}. Set FAB_PLAYER_SRC to the folder with source_4.zip and source.zip.`);
  }
  execFileSync('blender', ['--background', '--python', join(ROOT, 'prepare_fab_player.py')], {
    stdio: 'inherit',
    env: { ...process.env, FAB_PLAYER_SRC: src, FAB_PREP_DIR: PREP },
  });
}

function nodeWorld(node: GltfNode, cache: Map<GltfNode, Matrix4>): Matrix4 {
  const cached = cache.get(node);
  if (cached) return cached;
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  const local = new Matrix4().compose(new Vector3(t[0], t[1], t[2]), new Quaternion(r[0], r[1], r[2], r[3]), new Vector3(s[0], s[1], s[2]));
  const parent = node.getParentNode();
  const world = parent ? new Matrix4().multiplyMatrices(nodeWorld(parent, cache), local) : local;
  cache.set(node, world);
  return world;
}

function roleOf(name: string): Role {
  const role = name.split('@@')[0] as Role;
  if (!(ROLES as readonly string[]).includes(role)) throw new Error(`unexpected material ${name}`);
  return role;
}

function readModel(file: string): { prims: Prim[]; worldPos: Map<string, Vector3> } {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = io.read(file);
  // NodeIO.read is async; this wrapper is replaced by the async caller.
  void doc;
  throw new Error('use readModelAsync');
}

async function readModelAsync(file: string): Promise<{ prims: Prim[]; worldPos: Map<string, Vector3> }> {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(file);
  const cache = new Map<GltfNode, Matrix4>();
  const worldPos = new Map<string, Vector3>();
  const skin = doc.getRoot().listSkins()[0];
  if (!skin) throw new Error(`no skin in ${file}`);
  for (const joint of skin.listJoints()) {
    const world = nodeWorld(joint, cache);
    worldPos.set(joint.getName(), new Vector3().setFromMatrixPosition(world));
  }
  for (const name of JOINT_ORDER) {
    if (name !== 'Root' && !worldPos.has(name)) throw new Error(`${file} is missing ${name}`);
  }
  const jointIndex = new Map(skin.listJoints().map((joint, index) => [index, JOINT_ORDER.indexOf(joint.getName() as (typeof JOINT_ORDER)[number])]));
  const images = new Map<GltfPrim, Buffer>();
  const prims: Prim[] = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh || node.getSkin() !== skin) continue;
    for (const prim of mesh.listPrimitives()) {
      const material = prim.getMaterial();
      const texture = material?.getBaseColorTexture();
      const image = texture?.getImage();
      if (!material || !image) throw new Error(`primitive missing texture on ${node.getName()}`);
      const posAcc = prim.getAttribute('POSITION');
      const nrmAcc = prim.getAttribute('NORMAL');
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      const jointAcc = prim.getAttribute('JOINTS_0');
      const weightAcc = prim.getAttribute('WEIGHTS_0');
      const indexAcc = prim.getIndices();
      if (!posAcc || !uvAcc || !jointAcc || !weightAcc || !indexAcc) throw new Error(`incomplete primitive on ${node.getName()}`);
      // Vertices stay in mesh-local space. Joint world matrices already include
      // the armature scale, which is the same space these accessors were exported in.
      const pos = new Float32Array(posAcc.getArray() as Float32Array);
      const nrm = new Float32Array((nrmAcc?.getArray() as Float32Array | null) ?? pos.map((_, index) => (index % 3 === 1 ? 1 : 0)));
      const jointsIn = jointAcc.getArray();
      const weightsIn = weightAcc.getArray() as Float32Array;
      const count = pos.length / 3;
      const joints = new Uint16Array(count * 4);
      const weights = new Float32Array(count * 4);
      for (let v = 0; v < count; v++) {
        for (let k = 0; k < 4; k++) {
          const source = jointsIn[v * 4 + k] ?? 0;
          const mapped = jointIndex.get(source);
          if (mapped === undefined || mapped < 0) throw new Error(`joint ${source} on ${node.getName()}`);
          joints[v * 4 + k] = mapped;
          weights[v * 4 + k] = weightsIn[v * 4 + k] ?? 0;
        }
      }
      const role = roleOf(material.getName());
      if (role === 'Hair') {
        const head = JOINT_ORDER.indexOf('Head');
        for (let v = 0; v < count; v++) {
          joints[v * 4] = head;
          weights[v * 4] = 1;
          joints[v * 4 + 1] = 0; weights[v * 4 + 1] = 0;
          joints[v * 4 + 2] = 0; weights[v * 4 + 2] = 0;
          joints[v * 4 + 3] = 0; weights[v * 4 + 3] = 0;
        }
      }
      images.set(prim, Buffer.from(image));
      prims.push({
        role,
        image: images.get(prim)!,
        pos,
        nrm,
        uv: new Float32Array(uvAcc.getArray() as Float32Array),
        joints,
        weights,
        idx: new Uint32Array(indexAcc.getArray() as Uint32Array),
      });
    }
  }
  return { prims, worldPos };
}

function buildSkeleton(worldPos: Map<string, Vector3>) {
  const scene = new Group();
  const bones = new Map<string, Group>();
  const root = new Group();
  root.name = 'Root';
  scene.add(root);
  bones.set('Root', root);
  for (const name of JOINT_ORDER) {
    if (name === 'Root') continue;
    const bone = new Group();
    bone.name = name;
    const parent = bones.get(PARENT[name]);
    if (!parent) throw new Error(`missing parent for ${name}`);
    parent.add(bone);
    const here = worldPos.get(name);
    const there = worldPos.get(PARENT[name]) ?? new Vector3();
    if (!here) throw new Error(`missing joint ${name}`);
    bone.position.copy(here).sub(there);
    bone.quaternion.identity();
    bones.set(name, bone);
  }
  scene.updateMatrixWorld(true);
  for (const name of JOINT_ORDER) {
    const bone = bones.get(name)!;
    bone.userData.restY = bone.position.y;
    bone.userData.inverse = new Matrix4().copy(bone.matrixWorld).invert();
  }
  return { scene, bones };
}

function snapshotInverses(bones: Map<string, Group>) {
  const inv = new Map<string, Matrix4>();
  for (const name of JOINT_ORDER) inv.set(name, (bones.get(name)!.userData.inverse as Matrix4).clone());
  return inv;
}

function skinPrim(prim: Prim, bones: Map<string, Group>, inv: Map<string, Matrix4>) {
  const pos = new Float32Array(prim.pos.length);
  const nrm = new Float32Array(prim.nrm.length);
  const world = new Map<string, Matrix4>();
  const normal = new Map<string, Matrix4>();
  for (const name of JOINT_ORDER) {
    const matrix = new Matrix4().multiplyMatrices(bones.get(name)!.matrixWorld, inv.get(name)!);
    world.set(name, matrix);
    normal.set(name, new Matrix4().copy(matrix).invert().transpose());
  }
  const count = prim.pos.length / 3;
  for (let v = 0; v < count; v++) {
    const p = new Vector3(prim.pos[v * 3], prim.pos[v * 3 + 1], prim.pos[v * 3 + 2]);
    const n = new Vector3(prim.nrm[v * 3], prim.nrm[v * 3 + 1], prim.nrm[v * 3 + 2]);
    const sp = new Vector3();
    const sn = new Vector3();
    for (let k = 0; k < 4; k++) {
      const weight = prim.weights[v * 4 + k];
      if (weight <= 0) continue;
      const name = JOINT_ORDER[prim.joints[v * 4 + k]];
      sp.addScaledVector(p.clone().applyMatrix4(world.get(name)!), weight);
      sn.addScaledVector(n.clone().transformDirection(normal.get(name)!), weight);
    }
    pos[v * 3] = sp.x; pos[v * 3 + 1] = sp.y; pos[v * 3 + 2] = sp.z;
    sn.normalize();
    nrm[v * 3] = sn.x; nrm[v * 3 + 1] = sn.y; nrm[v * 3 + 2] = sn.z;
  }
  prim.pos = pos;
  prim.nrm = nrm;
}

function dropArms(bones: Map<string, Group>) {
  const aim = (arm: string, child: string, dir: Vector3) => {
    const from = bones.get(child)!.position.clone();
    if (from.lengthSq() < 1e-8) return;
    bones.get(arm)!.quaternion.copy(new Quaternion().setFromUnitVectors(from.normalize(), dir.clone().normalize()));
  };
  aim('UpperArm_L', 'LowerArm_L', new Vector3(-0.28, -1, 0.08));
  aim('UpperArm_R', 'LowerArm_R', new Vector3(0.28, -1, 0.08));
  const bend = (elbow: string, hand: string) => {
    const from = bones.get(hand)!.position.clone();
    if (from.lengthSq() < 1e-8) return;
    const axis = new Vector3().crossVectors(from.clone().normalize(), new Vector3(0, 0, 1));
    if (axis.lengthSq() < 1e-6) return;
    const bent = from.clone().normalize().applyAxisAngle(axis.normalize(), 0.4);
    bones.get(elbow)!.quaternion.copy(new Quaternion().setFromUnitVectors(from.normalize(), bent));
  };
  bend('LowerArm_L', 'Hand_L');
  bend('LowerArm_R', 'Hand_R');
  bones.get('Root')!.updateMatrixWorld(true);
}

function posedPositions(bones: Map<string, Group>) {
  const pos = new Map<string, Vector3>();
  for (const name of JOINT_ORDER) {
    if (name === 'Root') continue;
    pos.set(name, bones.get(name)!.getWorldPosition(new Vector3()));
  }
  return pos;
}

function bounds(prims: Prim[]) {
  const min = new Vector3(Infinity, Infinity, Infinity);
  const max = new Vector3(-Infinity, -Infinity, -Infinity);
  for (const prim of prims) {
    for (let i = 0; i < prim.pos.length; i += 3) {
      min.x = Math.min(min.x, prim.pos[i]); min.y = Math.min(min.y, prim.pos[i + 1]); min.z = Math.min(min.z, prim.pos[i + 2]);
      max.x = Math.max(max.x, prim.pos[i]); max.y = Math.max(max.y, prim.pos[i + 1]); max.z = Math.max(max.z, prim.pos[i + 2]);
    }
  }
  return { min, max };
}

function translate(prims: Prim[], bones: Map<string, Group>, dy: number) {
  bones.get('Hips')!.position.y += dy;
  for (const prim of prims) for (let i = 1; i < prim.pos.length; i += 3) prim.pos[i] += dy;
  bones.get('Root')!.updateMatrixWorld(true);
}

function srgbToLinear(c: number) {
  const u = c / 255;
  return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(c: number) {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

async function decodeImage(bytes: Buffer) {
  const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function imageKey(bytes: Buffer) {
  return createHash('sha1').update(bytes).digest('hex').slice(0, 16);
}

async function atlas(prims: Prim[], role: Role) {
  const group = prims.filter((prim) => prim.role === role);
  const keys: string[] = [];
  const buffers = new Map<string, Buffer>();
  for (const prim of group) {
    const key = imageKey(prim.image);
    if (!buffers.has(key)) { keys.push(key); buffers.set(key, prim.image); }
  }
  const cell = 1024;
  const cols = keys.length <= 1 ? 1 : 2;
  const rows = Math.ceil(keys.length / cols);
  const width = cols * cell;
  const height = rows * cell;
  const raw = Buffer.alloc(width * height * 4, 0);
  const placed = new Map<string, { u0: number; v0: number; su: number; sv: number }>();
  for (let i = 0; i < keys.length; i++) {
    const decoded = await decodeImage(buffers.get(keys[i])!);
    if (role === 'Skin') correctSkin(decoded.data, decoded.width, decoded.height);
    const resized = await sharp(decoded.data, { raw: { width: decoded.width, height: decoded.height, channels: 4 } })
      .resize(cell, cell, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const col = i % cols;
    const row = Math.floor(i / cols);
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const dst = ((row * cell + y) * width + col * cell + x) * 4;
        const src = (y * cell + x) * 4;
        raw[dst] = resized[src]; raw[dst + 1] = resized[src + 1]; raw[dst + 2] = resized[src + 2]; raw[dst + 3] = resized[src + 3];
      }
    }
    // glTF v is bottom-up in the image after sharp's top-left raw. UV v grows with image v
    // in the source, and we copied rows in the same order, so the cell follows the source.
    placed.set(keys[i], { u0: col / cols, v0: 1 - (row + 1) / rows, su: 1 / cols, sv: 1 / rows });
  }
  for (const prim of group) {
    const cellUv = placed.get(imageKey(prim.image))!;
    const uv = prim.uv;
    for (let i = 0; i < uv.length; i += 2) {
      const u = uv[i];
      const v = uv[i + 1];
      uv[i] = cellUv.u0 + u * cellUv.su;
      uv[i + 1] = cellUv.v0 + v * cellUv.sv;
    }
  }
  return { raw, width, height };
}

function linearLum(r: number, g: number, b: number) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Keep highlights under 1 so a bright cheek cannot clip to a white mask. */
function shoulder(x: number) {
  if (x <= 0.82) return x;
  const extra = x - 0.82;
  return 0.82 + 0.16 * (extra / (0.16 + extra));
}

/**
 * Arm and leg photos are surrounded by transparent black. Baking that as an
 * opaque texel, then letting the mip chain sample it, paints black fringes
 * on the hands and face. Fill those texels from the nearest real skin, then
 * expose each photo on its own so a bright arm cannot blow the head out.
 */
function correctSkin(raw: Buffer, width: number, height: number) {
  const count = width * height;
  const color = Buffer.from(raw);
  const filled = new Uint8Array(count);
  const hist = new Uint32Array(256);
  let samples = 0;
  const qx = new Int32Array(count);
  const qy = new Int32Array(count);
  let qt = 0;
  for (let y = 0, i = 0, p = 0; y < height; y++) {
    for (let x = 0; x < width; x++, i++, p += 4) {
      if (raw[p + 3] < 16) continue;
      const lum = linearLum(srgbToLinear(raw[p]), srgbToLinear(raw[p + 1]), srgbToLinear(raw[p + 2]));
      if (lum <= 0.02) continue;
      filled[i] = 1;
      hist[Math.min(255, Math.floor(lum * 255))]++;
      samples++;
      qx[qt] = x;
      qy[qt] = y;
      qt++;
    }
  }
  let qh = 0;
  while (qh < qt) {
    const x = qx[qh];
    const y = qy[qh];
    qh++;
    const src = (y * width + x) * 4;
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
    for (const [dx, dy] of neighbors) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
      const j = yy * width + xx;
      if (filled[j]) continue;
      filled[j] = 1;
      const dst = j * 4;
      color[dst] = color[src];
      color[dst + 1] = color[src + 1];
      color[dst + 2] = color[src + 2];
      color[dst + 3] = 255;
      qx[qt] = xx;
      qy[qt] = yy;
      qt++;
    }
  }
  let seen = 0;
  const target = Math.max(1, Math.floor(samples * 0.9));
  let p90 = 0.4;
  for (let bucket = 0; bucket < 256; bucket++) {
    seen += hist[bucket];
    if (seen >= target) {
      p90 = (bucket + 0.5) / 255;
      break;
    }
  }
  const scale = 0.62 / Math.max(0.08, p90);
  const tint = [0xe8, 0xb4, 0x8f].map(srgbToLinear);
  for (let p = 0; p < color.length; p += 4) {
    const r = srgbToLinear(color[p]);
    const g = srgbToLinear(color[p + 1]);
    const b = srgbToLinear(color[p + 2]);
    raw[p] = linearToSrgb(Math.min(0.88, shoulder(r * scale) / tint[0]));
    raw[p + 1] = linearToSrgb(Math.min(0.88, shoulder(g * scale) / tint[1]));
    raw[p + 2] = linearToSrgb(Math.min(0.88, shoulder(b * scale) / tint[2]));
    raw[p + 3] = 255;
  }
}

function neutralize(raw: Buffer, width: number, height: number, kind: 'keep' | 'cloth' | 'hair') {
  const out = Buffer.alloc(width * height * 3);
  for (let p = 0, o = 0; p < raw.length; p += 4, o += 3) {
    const r = srgbToLinear(raw[p]);
    const g = srgbToLinear(raw[p + 1]);
    const b = srgbToLinear(raw[p + 2]);
    const lum = linearLum(r, g, b);
    if (kind === 'cloth') {
      // Flat cloth. The shirt and shorts colours come only from the material tint,
      // so a source mask cannot leave a shard of the other colour.
      out[o] = out[o + 1] = out[o + 2] = linearToSrgb(0.92);
    } else if (kind === 'hair') {
      const lift = 0.55 + 0.45 * Math.min(1, lum / 0.35);
      out[o] = out[o + 1] = out[o + 2] = linearToSrgb(lift);
    } else {
      out[o] = raw[p]; out[o + 1] = raw[p + 1]; out[o + 2] = raw[p + 2];
    }
  }
  return out;
}

function detailNormal(rgb: Buffer, width: number, height: number, amp: number) {
  const out = Buffer.alloc(width * height * 3);
  const lum = (x: number, y: number) => {
    const xx = Math.max(0, Math.min(width - 1, x));
    const yy = Math.max(0, Math.min(height - 1, y));
    const i = (yy * width + xx) * 3;
    return (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const dx = lum(x + 1, y) - lum(x - 1, y);
    const dy = lum(x, y + 1) - lum(x, y - 1);
    const o = (y * width + x) * 3;
    out[o] = Math.max(0, Math.min(255, 128 - dx * amp));
    out[o + 1] = Math.max(0, Math.min(255, 128 + dy * amp));
    out[o + 2] = 255;
  }
  return out;
}

async function ktx(raw: Buffer, width: number, height: number, oetf: 'srgb' | 'linear', encode: 'uastc' | 'etc1s', key: string) {
  const cacheDir = join(tmpdir(), 'kickole-ktx-cache');
  mkdirSync(cacheDir, { recursive: true });
  const cached = join(cacheDir, `${key}.ktx2`);
  if (existsSync(cached)) return new Uint8Array(readFileSync(cached));
  const dir = mkdtempSync(join(tmpdir(), 'kickole-ktx-'));
  const png = join(dir, 'in.png');
  const out = join(dir, 'out.ktx2');
  await sharp(raw, { raw: { width, height, channels: 3 } }).png().toFile(png);
  const args = ['--genmipmap', '--encode', encode, '--assign_oetf', oetf, out, png];
  if (encode === 'uastc') args.splice(3, 0, '--uastc_quality', '1');
  else args.splice(3, 0, '--clevel', '2', '--qlevel', '140');
  execFileSync(TOKTX, args, { stdio: 'pipe' });
  const bytes = new Uint8Array(readFileSync(out));
  writeFileSync(cached, bytes);
  return bytes;
}

function freshEngine() {
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

function contactEngine(side: Side, dt: number) {
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

function followEngine(side: Side, since: number) {
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
  for (const key of keys) out[key] = lerp(a[key], b[key], t);
  for (const side of ['left', 'right'] as const) {
    const from = a.legs[side];
    const to = b.legs[side];
    out.legs[side] = {
      thigh: lerp(from.thigh, to.thigh, t), knee: lerp(from.knee, to.knee, t), abduct: lerp(from.abduct, to.abduct, t),
      twist: lerp(from.twist, to.twist, t), foot: lerp(from.foot, to.foot, t), ankleRoll: lerp(from.ankleRoll, to.ankleRoll, t), ankleYaw: lerp(from.ankleYaw, to.ankleYaw, t),
    };
  }
  return out;
}

function applyContract(bones: Map<string, Group>, pose: Pose) {
  const set = (name: string, x: number, y: number, z: number) => {
    const bone = bones.get(name);
    if (bone) bone.quaternion.setFromEuler(new Euler(x, y, z, 'XYZ'));
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
    const limb = pose.legs[side];
    set(thigh, limb.thigh, limb.twist, limb.abduct);
    set(shin, limb.knee, 0, 0);
    set(foot, limb.foot, limb.ankleYaw, limb.ankleRoll);
  };
  leg('left', 'UpperLeg_L', 'LowerLeg_L', 'Foot_L');
  leg('right', 'UpperLeg_R', 'LowerLeg_R', 'Foot_R');
  bones.get('Root')!.updateMatrixWorld(true);
}

function resetBind(bones: Map<string, Group>) {
  for (const name of JOINT_ORDER) {
    const bone = bones.get(name)!;
    bone.quaternion.identity();
    if (name === 'Hips') bone.position.y = bone.userData.restY as number;
  }
  bones.get('Root')!.updateMatrixWorld(true);
  for (const name of JOINT_ORDER) {
    bones.get(name)!.userData.inverse = new Matrix4().copy(bones.get(name)!.matrixWorld).invert();
  }
}

function loopingIdle(time: number) {
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

interface Nudge { thigh: number; knee: number; foot: number; abduct: number }

function nudgeBoot(pose: Pose, side: Side, amount: number, nudge: Nudge) {
  const leg = pose.legs[side];
  leg.thigh += nudge.thigh * amount;
  leg.knee += nudge.knee * amount;
  leg.foot += nudge.foot * amount;
  leg.abduct += (side === 'left' ? nudge.abduct : -nudge.abduct) * amount;
  return pose;
}

function bootGap(prims: Prim[], bones: Map<string, Group>, pose: Pose, side: Side) {
  applyContract(bones, loopingIdle(0));
  const footName = side === 'left' ? 'Foot_L' : 'Foot_R';
  const restZ = bones.get(footName)!.getWorldPosition(new Vector3()).z;
  applyContract(bones, pose);
  const sign = side === 'left' ? -1 : 1;
  const ball = new Vector3(sign * 0.17 * 0.6, 0.72, 0.62);
  const toe = bones.get(side === 'left' ? 'Toe_L' : 'Toe_R')!.getWorldPosition(new Vector3());
  const footZ = bones.get(footName)!.getWorldPosition(new Vector3()).z;
  let mesh = Infinity;
  let samples = 0;
  for (const prim of prims) {
    if (prim.role !== 'Boots' && prim.role !== 'Boots_Sole') continue;
    for (let v = 0; v < prim.pos.length / 3; v++) {
      const p = new Vector3(prim.pos[v * 3], prim.pos[v * 3 + 1], prim.pos[v * 3 + 2]);
      const skinned = new Vector3();
      for (let k = 0; k < 4; k++) {
        const weight = prim.weights[v * 4 + k];
        if (weight <= 0) continue;
        const name = JOINT_ORDER[prim.joints[v * 4 + k]];
        const inverse = bones.get(name)!.userData.inverse as Matrix4;
        const world = new Matrix4().multiplyMatrices(bones.get(name)!.matrixWorld, inverse);
        skinned.addScaledVector(p.clone().applyMatrix4(world), weight);
      }
      samples++;
      mesh = Math.min(mesh, skinned.distanceTo(ball) - 0.14);
    }
  }
  if (!samples) throw new Error('no boot vertices');
  resetBind(bones);
  return { mesh, bone: toe.distanceTo(ball) - 0.14, footDz: footZ - restZ, toeY: toe.y };
}

function chooseNudge(prims: Prim[], bones: Map<string, Group>): Nudge {
  let best: Nudge = { thigh: -0.41, knee: 0.53, foot: -0.05, abduct: 0.1 };
  let bestScore = Number.POSITIVE_INFINITY;
  const grid = (nudge: Nudge) => {
    let score = 0;
    for (const side of ['left', 'right'] as const) {
      const pose = nudgeBoot(computePose(contactEngine(side, 0.04)), side, 1, nudge);
      const gap = bootGap(prims, bones, pose, side);
      const meshMiss = Math.abs(gap.mesh - 0.028) * 8;
      const sunk = gap.mesh < 0.008 ? (0.008 - gap.mesh) * 30 : 0;
      const bone = gap.bone < 0.06 ? (0.06 - gap.bone) * 8 : gap.bone > 0.14 ? (gap.bone - 0.14) * 6 : Math.abs(gap.bone - 0.09);
      const swing = gap.footDz < 0.28 ? 5 : 0;
      const lowToe = gap.toeY < 0.64 ? (0.64 - gap.toeY) * 50 : 0;
      score += meshMiss + sunk + bone + swing + lowToe;
    }
    if (score < bestScore) { bestScore = score; best = nudge; }
  };
  for (const thigh of [-0.55, -0.4, -0.25, -0.1]) {
    for (const knee of [0.35, 0.55, 0.75]) {
      for (const foot of [-0.2, 0.05, 0.3]) {
        for (const abduct of [0, 0.12]) grid({ thigh, knee, foot, abduct });
      }
    }
  }
  console.log('boot nudge', best, 'score', +bestScore.toFixed(3));
  return best;
}

function sampleTimes(duration: number, fn: (t: number) => Pose) {
  const frames = Math.max(1, Math.round(duration * 30));
  const times = new Float32Array(frames + 1);
  const poses: Pose[] = [];
  let armL = fn(0).armLeft;
  let armR = fn(0).armRight;
  for (let i = 0; i <= frames; i++) {
    const time = Math.min(duration, i / 30);
    times[i] = time;
    const pose = fn(time);
    armL += (pose.armLeft - armL) * 0.55;
    armR += (pose.armRight - armR) * 0.55;
    pose.armLeft = armL;
    pose.armRight = armR;
    poses.push(pose);
  }
  return { times, poses };
}

function kickFn(side: Side, nudge: Nudge) {
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

function missFn(time: number) {
  const engine = freshEngine();
  engine.phase = 'dropped';
  engine.time = time;
  engine.lastDropTime = 0;
  const pose = computePose(engine);
  pose.torsoPitch += smooth(Math.min(1, time / 0.35)) * 0.05;
  return pose;
}

function celebrateFn(time: number) {
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

function simplifyPrim(prim: Prim, ratio: number): Prim {
  if (prim.idx.length < 90 || ratio >= 0.98) return prim;
  const indices = prim.idx;
  const target = Math.max(30, Math.round(indices.length * ratio / 3) * 3);
  let error = 0.02;
  let next = MeshoptSimplifier.simplify(indices, prim.pos, 3, target, error)[0];
  while (next.length > target * 1.15 && error < 0.2) {
    error += 0.04;
    next = MeshoptSimplifier.simplify(indices, prim.pos, 3, target, error)[0];
  }
  const remap = new Map<number, number>();
  const idx: number[] = [];
  for (const old of next) {
    let n = remap.get(old);
    if (n === undefined) { n = remap.size; remap.set(old, n); }
    idx.push(n);
  }
  const order = [...remap.entries()].sort((a, b) => a[1] - b[1]).map(([old]) => old);
  const copyF = (src: Float32Array, stride: number) => {
    const out = new Float32Array(order.length * stride);
    order.forEach((old, i) => { for (let k = 0; k < stride; k++) out[i * stride + k] = src[old * stride + k]; });
    return out;
  };
  const copyJ = (src: Uint16Array) => {
    const out = new Uint16Array(order.length * 4);
    order.forEach((old, i) => { for (let k = 0; k < 4; k++) out[i * 4 + k] = src[old * 4 + k]; });
    return out;
  };
  return { ...prim, pos: copyF(prim.pos, 3), nrm: copyF(prim.nrm, 3), uv: copyF(prim.uv, 2), joints: copyJ(prim.joints), weights: copyF(prim.weights, 4), idx: new Uint32Array(idx) };
}

function triCount(prims: Prim[]) {
  return prims.reduce((sum, prim) => sum + prim.idx.length / 3, 0);
}

async function writeGlb(prims: Prim[], bones: Map<string, Group>, clips: { name: string; times: Float32Array; poses: Pose[] }[], textures: Map<Role, { albedo: Uint8Array; normal: Uint8Array }>, file: string) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  resetBind(bones);
  const doc = new Document();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const clearExt = doc.createExtension(KHRMaterialsClearcoat);
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Kickole');
  const nodes = new Map<string, GltfNode>();
  const root = doc.createNode('Root');
  nodes.set('Root', root);
  scene.addChild(root);
  for (const name of JOINT_ORDER) {
    if (name === 'Root') continue;
    const node = doc.createNode(name);
    nodes.set(name, node);
    nodes.get(PARENT[name])!.addChild(node);
    const bone = bones.get(name)!;
    node.setTranslation([bone.position.x, bone.position.y, bone.position.z]);
  }
  const skin = doc.createSkin('Footballer').setSkeleton(root);
  const ibm = new Float32Array(JOINT_ORDER.length * 16);
  JOINT_ORDER.forEach((name, index) => {
    const inverse = new Matrix4().copy(bones.get(name)!.matrixWorld).invert();
    bones.get(name)!.userData.inverse = inverse;
    ibm.set(inverse.elements, index * 16);
    skin.addJoint(nodes.get(name)!);
  });
  skin.setInverseBindMatrices(doc.createAccessor().setType('MAT4').setArray(ibm).setBuffer(buffer));

  const texCache = new Map<string, ReturnType<Document['createTexture']>>();
  const texture = (name: string, bytes: Uint8Array) => {
    const key = `${name}:${bytes.byteLength}:${bytes[0]}:${bytes[bytes.length - 1]}`;
    const hit = texCache.get(key);
    if (hit) return hit;
    const created = doc.createTexture(name).setMimeType('image/ktx2').setImage(bytes);
    texCache.set(key, created);
    return created;
  };
  const materials = new Map<Role, Material>();
  const present = new Set(prims.map((prim) => prim.role));
  for (const role of present) {
    const maps = textures.get(role);
    if (!maps) throw new Error(`missing texture ${role}`);
    // Distinct factors so dedup keeps every kit slot. The runtime tints by material name.
    const rough: Record<Role, number> = {
      Skin: 0.5, Hair: 0.55, Eyes: 0.22, InnerMouth: 0.66,
      Shirt: 0.56, Shirt_Trim: 0.4, Shorts: 0.61, Socks: 0.68,
      Boots: 0.42, Boots_Sole: 0.88,
    };
    const mat = doc.createMaterial(role)
      .setRoughnessFactor(rough[role])
      .setMetallicFactor(0)
      .setBaseColorFactor([1, 1, 1, 1])
      .setBaseColorTexture(texture(`${role}-albedo`, maps.albedo))
      .setNormalTexture(texture(`${role}-normal`, maps.normal))
      .setDoubleSided(role === 'Hair' || role === 'Eyes' || role === 'InnerMouth');
    if (role === 'Boots') {
      mat.setExtension('KHR_materials_clearcoat', clearExt.createClearcoat().setClearcoatFactor(0.22).setClearcoatRoughnessFactor(0.35));
    }
    materials.set(role, mat);
  }
  const mesh = doc.createMesh('Footballer');
  for (const prim of prims) {
    const geo = doc.createPrimitive()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(prim.pos).setBuffer(buffer))
      .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(prim.nrm).setBuffer(buffer))
      .setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(prim.uv).setBuffer(buffer))
      .setAttribute('JOINTS_0', doc.createAccessor().setType('VEC4').setArray(prim.joints).setBuffer(buffer))
      .setAttribute('WEIGHTS_0', doc.createAccessor().setType('VEC4').setArray(prim.weights).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(prim.idx).setBuffer(buffer))
      .setMaterial(materials.get(prim.role)!);
    mesh.addPrimitive(geo);
  }
  scene.addChild(doc.createNode('FootballerMesh').setMesh(mesh).setSkin(skin));

  for (const clip of clips) {
    const anim = doc.createAnimation(clip.name);
    const input = doc.createAccessor().setType('SCALAR').setArray(clip.times).setBuffer(buffer);
    const tracks = ['Hips', 'Spine', 'Neck', 'Head', 'UpperArm_L', 'UpperArm_R', 'LowerArm_L', 'LowerArm_R', 'UpperLeg_L', 'UpperLeg_R', 'LowerLeg_L', 'LowerLeg_R', 'Foot_L', 'Foot_R'];
    const rot = new Map(tracks.map((name) => [name, new Float32Array(clip.poses.length * 4)]));
    const hipT = new Float32Array(clip.poses.length * 3);
    for (let i = 0; i < clip.poses.length; i++) {
      applyContract(bones, clip.poses[i]);
      for (const name of tracks) {
        const q = bones.get(name)!.quaternion;
        rot.get(name)!.set([q.x, q.y, q.z, q.w], i * 4);
      }
      const hips = bones.get('Hips')!.position;
      hipT.set([hips.x, hips.y, hips.z], i * 3);
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
  resetBind(bones);
  await doc.transform(prune(), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(file, doc);
}

async function encodeTextures(prims: Prim[]) {
  const textures = new Map<Role, { albedo: Uint8Array; normal: Uint8Array }>();
  const present = [...new Set(prims.map((prim) => prim.role))];
  for (const role of present) {
    const packed = await atlas(prims, role);
    const kind = role === 'Hair' ? 'hair' : role === 'Eyes' || role === 'InnerMouth' || role === 'Skin' ? 'keep' : 'cloth';
    const albedo = neutralize(packed.raw, packed.width, packed.height, kind);
    const normal = detailNormal(albedo, packed.width, packed.height, role === 'Skin' || role === 'Hair' ? 0.45 : 0.35);
    const hash = createHash('sha1').update(albedo).digest('hex').slice(0, 10);
    let divisor = 1;
    while (Math.max(packed.width, packed.height) / divisor > 1024) divisor *= 2;
    const albedoW = packed.width / divisor;
    const albedoH = packed.height / divisor;
    const albedoBytes = await ktx(
      await sharp(albedo, { raw: { width: packed.width, height: packed.height, channels: 3 } }).resize(albedoW, albedoH, { fit: 'fill' }).raw().toBuffer(),
      albedoW, albedoH, 'srgb', role === 'Skin' || role === 'Hair' || role === 'Eyes' || role === 'InnerMouth' ? 'uastc' : 'etc1s',
      `${role}-a-${hash}-${albedoW}x${albedoH}`,
    );
    const normalBytes = await ktx(
      await sharp(normal, { raw: { width: packed.width, height: packed.height, channels: 3 } }).resize(512, 512, { fit: 'fill' }).raw().toBuffer(),
      512, 512, 'linear', 'uastc', `${role}-n-${hash}`,
    );
    textures.set(role, { albedo: albedoBytes, normal: normalBytes });
    console.log(role, `${packed.width}x${packed.height}`, '->', `${albedoW}x${albedoH}`, 'ktx', albedoBytes.byteLength);
  }
  return textures;
}

async function buildBody(body: 'male' | 'female') {
  const loaded = await readModelAsync(join(PREP, `${body}.glb`));
  const prims = loaded.prims;
  // Arms are already hanging. Blender posed the full rig, including shoulders, before the weights were merged.
  let built = buildSkeleton(loaded.worldPos);
  const hand = built.bones.get('Hand_L')!.getWorldPosition(new Vector3());
  if (hand.y > 1.4) {
    const bindInv = snapshotInverses(built.bones);
    dropArms(built.bones);
    for (const prim of prims) skinPrim(prim, built.bones, bindInv);
    built = buildSkeleton(posedPositions(built.bones));
  }
  const box = bounds(prims);
  console.log(body, 'rest bounds', box.min.toArray().map((v) => +v.toFixed(3)), box.max.toArray().map((v) => +v.toFixed(3)), 'h', +(box.max.y - box.min.y).toFixed(3));
  translate(prims, built.bones, -box.min.y);
  built.bones.get('Hips')!.userData.restY = built.bones.get('Hips')!.position.y;
  resetBind(built.bones);
  const handL = built.bones.get('Hand_L')!.getWorldPosition(new Vector3());
  const handR = built.bones.get('Hand_R')!.getWorldPosition(new Vector3());
  const toe = built.bones.get('Toe_L')!.getWorldPosition(new Vector3());
  console.log(body, 'hands', handL.toArray().map((v) => +v.toFixed(3)), handR.toArray().map((v) => +v.toFixed(3)), 'toeL', toe.toArray().map((v) => +v.toFixed(3)));
  const nudge = chooseNudge(prims, built.bones);
  const clips = [
    { name: 'Idle', ...sampleTimes(2, loopingIdle) },
    { name: 'KickLeft', ...sampleTimes(0.9, kickFn('left', nudge)) },
    { name: 'KickRight', ...sampleTimes(0.9, kickFn('right', nudge)) },
    { name: 'Miss', ...sampleTimes(1.2, missFn) },
    { name: 'Celebrate', ...sampleTimes(1.2, celebrateFn) },
  ];
  const textures = await encodeTextures(prims);
  const out0 = join(PUBLIC, body === 'male' ? 'kickole_player_v4.glb' : 'kickole_player_v4_female.glb');
  const out1 = join(PUBLIC, body === 'male' ? 'kickole_player_v4_lod1.glb' : 'kickole_player_v4_female_lod1.glb');
  console.log(body, 'LOD0 tris', triCount(prims));
  await writeGlb(prims, built.bones, clips, textures, out0);
  const total = triCount(prims);
  const target = 13500;
  const protect = new Set<Role>(['Eyes', 'InnerMouth', 'Hair']);
  const flexible = prims.filter((prim) => !protect.has(prim.role));
  const fixed = total - triCount(flexible);
  const ratio = Math.min(0.92, Math.max(0.35, (target - fixed) / Math.max(1, triCount(flexible))));
  const lod = prims.map((prim) => simplifyPrim(prim, protect.has(prim.role) ? 0.9 : ratio));
  console.log(body, 'LOD1 tris', triCount(lod), 'ratio', +ratio.toFixed(3));
  await writeGlb(lod, built.bones, clips, textures, out1);
}

async function main() {
  prepareSources();
  const which = process.env.BODY;
  const bodies = which === 'male' || which === 'female' ? [which] : ['male', 'female'] as const;
  for (const body of bodies) await buildBody(body);
  console.log('FAB PLAYER DONE');
}

void readModel;
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
