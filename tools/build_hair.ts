/**
 * Original alpha-card hairstyles for the purchased footballers.
 *
 * The Fab packs only include the male cap and the female ponytail. Every
 * other style is drawn here: strand, braid, curl, spike and stubble cards
 * seated on the skulls in src/scene/hairFit.ts, plus an opaque scalp cap
 * so a bald or shaved head does not show the photograph's painted hair.
 *
 * Output: public/models/hair/kickole_hair.glb (EXT_meshopt_compression).
 * Run: npm run build:hair
 */
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, NodeIO, type Material, type Texture } from '@gltf-transform/core';
import { EXTMeshoptCompression } from '@gltf-transform/extensions';
import { meshopt, prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { Matrix3, Matrix4, SphereGeometry, Vector3 } from 'three';
import { HAIR_STYLES, type HairStyle } from '../src/game/appearance';
import {
  createHairGeometry,
  hairMatrix,
  hairParts,
  scalpSpec,
  type HairAtlas,
  type HairBody,
  type HairCard,
} from '../src/scene/hairFit';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outFile = join(root, 'public/models/hair/kickole_hair.glb');
const BODIES: HairBody[] = ['male', 'female', 'primitive'];
const ATLASES: HairAtlas[] = ['strand', 'braid', 'curl', 'spike', 'stubble', 'crest'];

interface Geo {
  pos: number[];
  nrm: number[];
  uv: number[];
  idx: number[];
}

function emptyGeo(): Geo {
  return { pos: [], nrm: [], uv: [], idx: [] };
}

function hash(x: number, y: number) {
  let n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  n = (n ^ (n >>> 13)) >>> 0;
  n = Math.imul(n, 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function smooth(t: number) {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

interface Maps {
  color: Buffer;
  normal: Buffer;
  rough: Buffer;
}

function finish(width: number, height: number, alpha: Float32Array, shade: (a: number, x: number, y: number) => number): Maps {
  const color = Buffer.alloc(width * height * 4);
  const normal = Buffer.alloc(width * height * 4);
  const rough = Buffer.alloc(width * height * 4);
  const at = (x: number, y: number) => alpha[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const a = alpha[i];
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      let nx = -dx * 3.2;
      let ny = -dy * 1.4;
      let nz = 0.85;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const o = i * 4;
      const tone = shade(a, x, y);
      color[o] = tone;
      color[o + 1] = tone;
      color[o + 2] = tone;
      color[o + 3] = Math.round(a * 255);
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
      const roughG = Math.round(210 - a * 90);
      rough[o] = 255;
      rough[o + 1] = roughG;
      rough[o + 2] = 0;
      rough[o + 3] = 255;
    }
  }
  return { color, normal, rough };
}

function strandMaps(): Maps {
  const width = 128;
  const height = 256;
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0;
      for (let s = 0; s < 11; s++) {
        const wobble = Math.sin(y * 0.05 + s * 1.7) * 1.8 + Math.sin(y * 0.013 + s * 0.6) * 3.2;
        const cx = ((s + 0.5) / 11) * width + wobble;
        const strand = 1.7 + (s % 4) * 0.35;
        const d = Math.abs(x - cx);
        const fiber = Math.max(0, 1 - d / strand);
        a = Math.max(a, fiber * fiber);
      }
      if (hash(x, Math.floor(y / 18)) > 0.92) a *= 0.15;
      const tip = smooth(y / 14) * smooth((height - y) / 18);
      alpha[y * width + x] = a * (0.35 + 0.65 * tip);
    }
  }
  return finish(width, height, alpha, (a) => Math.round(214 + a * 30));
}

function braidMaps(): Maps {
  const width = 96;
  const height = 256;
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0;
      for (let s = 0; s < 3; s++) {
        const cx = width * 0.5 + Math.sin((y / height) * Math.PI * 8 + s * 2.094) * width * 0.16;
        const d = Math.abs(x - cx);
        const fiber = smooth(1 - d / (width * 0.2));
        a = Math.max(a, fiber);
      }
      const edge = smooth(x / 6) * smooth((width - 1 - x) / 6);
      alpha[y * width + x] = a * edge;
    }
  }
  return finish(width, height, alpha, (a) => Math.round(188 + a * 50));
}

function curlMaps(): Maps {
  const size = 192;
  const alpha = new Float32Array(size * size);
  const clumps = [
    [0.28, 0.3, 0.16],
    [0.62, 0.34, 0.15],
    [0.42, 0.62, 0.2],
    [0.72, 0.7, 0.13],
    [0.24, 0.74, 0.12],
  ];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let a = 0;
      for (const [cx, cy, rad] of clumps) {
        const dx = x / size - cx;
        const dy = y / size - cy;
        const dist = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        const spiral = rad * (0.55 + 0.45 * (0.5 + 0.5 * Math.sin(ang * 3 + dist * 28)));
        const ring = Math.exp(-((dist - spiral) ** 2) / 0.0016);
        a = Math.max(a, ring);
      }
      for (let s = 0; s < 6; s++) {
        const cx = size * (0.18 + s * 0.13) + Math.sin(y * 0.08 + s) * 4;
        const d = Math.abs(x - cx);
        a = Math.max(a, Math.max(0, 1 - d / 2.2) ** 2 * 0.55);
      }
      alpha[y * size + x] = Math.min(1, a);
    }
  }
  return finish(size, size, alpha, (a) => Math.round(208 + a * 36));
}

function spikeMaps(): Maps {
  const width = 96;
  const height = 256;
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1);
    const half = width * (0.42 * (1 - t) ** 1.2 + 0.015);
    const cx = width / 2 + Math.sin(t * 9) * width * 0.02 * (1 - t);
    for (let x = 0; x < width; x++) {
      const d = Math.abs(x - cx);
      if (d > half) continue;
      let a = Math.max(0, 1 - d / half);
      a = a * a * (0.55 + 0.45 * (1 - t));
      for (let s = -1; s <= 1; s++) {
        const fiber = Math.abs(x - (cx + s * half * 0.28));
        a = Math.max(a, Math.max(0, 1 - fiber / 1.3) ** 2 * (1 - t * 0.2));
      }
      alpha[y * width + x] = Math.min(1, a);
    }
  }
  return finish(width, height, alpha, (a) => Math.round(220 + a * 25));
}

function stubbleMaps(): Maps {
  const size = 128;
  const alpha = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = 6;
      const gx = Math.floor(x / cell);
      const gy = Math.floor(y / cell);
      if (hash(gx, gy) < 0.38) continue;
      const lx = x - gx * cell - cell / 2;
      const ly = y - gy * cell;
      if (ly > 4) continue;
      const tick = Math.max(0, 1 - Math.abs(lx) / 1.2);
      alpha[y * size + x] = tick > 0.4 ? 0.95 : 0;
    }
  }
  return finish(size, size, alpha, () => 210);
}

/** Dense strip used by the mohawk so the crest reads as hair from the front and the side. */
function crestMaps(): Maps {
  const width = 128;
  const height = 256;
  const alpha = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0;
      for (let s = 0; s < 16; s++) {
        const wobble = Math.sin(y * 0.04 + s * 1.3) * 1.1;
        const cx = ((s + 0.5) / 16) * width + wobble;
        const fiber = Math.max(0, 1 - Math.abs(x - cx) / 3.4);
        a = Math.max(a, fiber);
      }
      const edge = smooth(x / 8) * smooth((width - 1 - x) / 8) * smooth(y / 10);
      alpha[y * width + x] = a * edge;
    }
  }
  return finish(width, height, alpha, (a) => Math.round(200 + a * 40));
}

async function toPng(raw: Buffer, width: number, height: number) {
  return sharp(raw, { raw: { width, height, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer();
}

function bakeCard(card: HairCard, geo: Geo) {
  const geometry = createHairGeometry(card);
  const posed = hairMatrix(card, new Matrix4());
  const normalMatrix = new Matrix3().getNormalMatrix(posed);
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  if (!index) throw new Error(`card ${card.id} has no index`);
  const base = geo.pos.length / 3;
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(posed);
    geo.pos.push(vertex.x, vertex.y, vertex.z);
    vertex.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix).normalize();
    geo.nrm.push(vertex.x, vertex.y, vertex.z);
    geo.uv.push(uv.getX(i), uv.getY(i));
  }
  for (let i = 0; i < index.count; i++) geo.idx.push(index.getX(i) + base);
  geometry.dispose();
}

function bakePositions(geometry: SphereGeometry, shift: Vector3, geo: Geo) {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const index = geometry.getIndex();
  if (!index) throw new Error('scalp has no index');
  const base = geo.pos.length / 3;
  const vertex = new Vector3();
  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i).add(shift);
    geo.pos.push(vertex.x, vertex.y, vertex.z);
    vertex.fromBufferAttribute(normal, i).normalize();
    geo.nrm.push(vertex.x, vertex.y, vertex.z);
    geo.uv.push(uv.getX(i), uv.getY(i));
  }
  for (let i = 0; i < index.count; i++) geo.idx.push(index.getX(i) + base);
}

function addMesh(
  doc: Document,
  buffer: ReturnType<Document['createBuffer']>,
  scene: ReturnType<Document['createScene']>,
  name: string,
  primitives: Array<{ geo: Geo; material: Material }>,
) {
  const mesh = doc.createMesh(name);
  for (const { geo, material } of primitives) {
    if (geo.idx.length === 0) continue;
    const prim = doc.createPrimitive().setMaterial(material);
    prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.pos)).setBuffer(buffer));
    prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(geo.nrm)).setBuffer(buffer));
    prim.setAttribute('TEXCOORD_0', doc.createAccessor().setType('VEC2').setArray(new Float32Array(geo.uv)).setBuffer(buffer));
    const indices = geo.idx.length > 65535 ? new Uint32Array(geo.idx) : new Uint16Array(geo.idx);
    prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(indices).setBuffer(buffer));
    mesh.addPrimitive(prim);
  }
  if (mesh.listPrimitives().length === 0) return;
  scene.addChild(doc.createNode(name).setMesh(mesh));
}

async function main() {
  await MeshoptEncoder.ready;
  const io = new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({
    'meshopt.decoder': MeshoptDecoder,
    'meshopt.encoder': MeshoptEncoder,
  });
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene('Hair');
  doc.getRoot().setDefaultScene(scene);

  const drawn: Record<HairAtlas, Maps> = {
    strand: strandMaps(),
    braid: braidMaps(),
    curl: curlMaps(),
    spike: spikeMaps(),
    stubble: stubbleMaps(),
    crest: crestMaps(),
  };
  const materials = {} as Record<HairAtlas, Material>;
  for (const atlas of ATLASES) {
    const maps = drawn[atlas];
    const size = maps.color.length === 128 * 256 * 4 ? [128, 256]
      : maps.color.length === 96 * 256 * 4 ? [96, 256]
        : maps.color.length === 192 * 192 * 4 ? [192, 192]
          : maps.color.length === 128 * 128 * 4 ? [128, 128]
            : null;
    if (!size) throw new Error(`unexpected ${atlas} map`);
    const colorTex = await texture(doc, `${atlas}-color`, maps.color, size[0], size[1]);
    const normalTex = await texture(doc, `${atlas}-normal`, maps.normal, size[0], size[1]);
    const roughTex = await texture(doc, `${atlas}-rough`, maps.rough, size[0], size[1]);
    materials[atlas] = doc.createMaterial(`hair-${atlas}`)
      .setBaseColorTexture(colorTex)
      .setNormalTexture(normalTex)
      .setMetallicRoughnessTexture(roughTex)
      .setMetallicFactor(0)
      .setRoughnessFactor(1)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.42)
      .setDoubleSided(true);
  }

  let cards = 0;
  for (const body of BODIES) {
    for (const entry of HAIR_STYLES) {
      const style: HairStyle = entry.id;
      const parts = hairParts(style, body);
      if (parts.length === 0) continue;
      const buckets = new Map<HairAtlas, Geo>();
      for (const card of parts) {
        const geo = buckets.get(card.atlas) ?? emptyGeo();
        bakeCard(card, geo);
        buckets.set(card.atlas, geo);
      }
      addMesh(
        doc,
        buffer,
        scene,
        `${body}-${style}`,
        [...buckets.entries()].map(([atlas, geo]) => ({ geo, material: materials[atlas] })),
      );
      cards += parts.length;
      console.log(`${body}-${style}`, parts.length);
    }
    const spec = scalpSpec(body);
    const sphere = new SphereGeometry(
      spec.radius,
      28,
      18,
      spec.phiStart,
      spec.phiLength,
      spec.thetaStart,
      spec.thetaLength,
    );
    const geo = emptyGeo();
    bakePositions(sphere, new Vector3(...spec.center), geo);
    sphere.dispose();
    const scalp = doc.createMaterial(`scalp-${body}`)
      .setBaseColorFactor([...spec.color, 1])
      .setRoughnessFactor(0.72)
      .setMetallicFactor(0)
      .setDoubleSided(false)
      .setAlphaMode('OPAQUE');
    addMesh(doc, buffer, scene, `${body}-scalp`, [{ geo, material: scalp }]);
  }

  mkdirSync(dirname(outFile), { recursive: true });
  await doc.transform(prune(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(outFile, doc);
  const bytes = readFileSync(outFile).length;
  console.log('cards', cards, 'bytes', bytes);
}

async function texture(doc: Document, name: string, raw: Buffer, width: number, height: number): Promise<Texture> {
  const png = await toPng(raw, width, height);
  return doc.createTexture(name).setImage(png).setMimeType('image/png');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
