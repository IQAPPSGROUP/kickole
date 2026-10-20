/**
 * CC0 location scenery: Poly Haven HDRIs, PBR grounds, and prop models.
 * Writes KTX2 textures and meshopt + KTX2 GLBs. Sources are downloaded
 * at build time and are not committed.
 *
 *   HDRIs (1K, CC0): docklands_02, green_point_park, spiaggia_di_mondello
 *   Textures (1K, CC0): sand_03, rubberized_track, grass_ground
 *   Models (CC0): anthurium_botany_01, barrel_03, metal_trash_can, flower_gazania
 *
 * Run: npm run build:locations
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRTextureBasisu, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = '/tmp/kickole-src';
const outTex = join(root, 'public/textures/locations');
const outModel = join(root, 'public/models/environment/locations');
const TOKTX = process.env.TOKTX ?? `${process.env.HOME}/ktx/KTX-Software-4.4.0-Linux-x86_64/bin/toktx`;
const KTX_LIB = process.env.KTX_LIB ?? `${process.env.HOME}/ktx/KTX-Software-4.4.0-Linux-x86_64/lib`;

const HDRS = [
  ['docklands_02_1k.hdr', 'street_docklands_1k.hdr', 'street_sky.jpg'],
  ['green_point_park_1k.hdr', 'court_green_point_1k.hdr', 'court_sky.jpg'],
  ['spiaggia_di_mondello_1k.hdr', 'beach_mondello_1k.hdr', 'beach_sky.jpg'],
] as const;

interface ModelJob {
  slug: string;
  file: string;
  /** Keep about this many triangles after simplify. */
  triangles: number;
  alpha?: string;
}

const MODELS: ModelJob[] = [
  { slug: 'anthurium_botany_01', file: 'anthurium.glb', triangles: 9000, alpha: 'anthurium_alpha.png' },
  { slug: 'barrel_03', file: 'barrel.glb', triangles: 2500 },
  { slug: 'metal_trash_can', file: 'trash-can.glb', triangles: 8000 },
  { slug: 'flower_gazania', file: 'gazania.glb', triangles: 7000, alpha: 'gazania_alpha.png' },
];

function decodeRGBE(buf: Buffer): { width: number; height: number; rgb: Float32Array } {
  let headerEnd = buf.indexOf('\n\n');
  let sep = 2;
  if (headerEnd < 0) {
    headerEnd = buf.indexOf('\r\n\r\n');
    sep = 4;
  }
  if (headerEnd < 0) throw new Error('RGBE header not found');
  const header = buf.toString('ascii', 0, headerEnd);
  if (!header.startsWith('#?RADIANCE') && !header.startsWith('#?RGBE')) throw new Error('Not an RGBE file');
  let offset = headerEnd + sep;
  const lineEnd = buf.indexOf('\n', offset);
  const resLine = buf.toString('ascii', offset, lineEnd).trim();
  const match = resLine.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  if (!match) throw new Error(`Unexpected RGBE resolution: ${resLine}`);
  const height = Number(match[1]);
  const width = Number(match[2]);
  offset = lineEnd + 1;
  const rgb = new Float32Array(width * height * 3);
  const scan = Buffer.alloc(width * 4);
  for (let y = 0; y < height; y++) {
    if (buf[offset] !== 2 || buf[offset + 1] !== 2) throw new Error('RGBE scanline is not RLE');
    offset += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < width) {
        const code = buf[offset++];
        if (code > 128) {
          const run = code - 128;
          const value = buf[offset++];
          scan.fill(value, c * width + x, c * width + x + run);
          x += run;
        } else {
          buf.copy(scan, c * width + x, offset, offset + code);
          offset += code;
          x += code;
        }
      }
    }
    for (let x = 0; x < width; x++) {
      const e = scan[3 * width + x];
      const i = (y * width + x) * 3;
      const scale = e === 0 ? 0 : 2 ** (e - 128 - 8);
      rgb[i] = scan[x] * scale;
      rgb[i + 1] = scan[width + x] * scale;
      rgb[i + 2] = scan[2 * width + x] * scale;
    }
  }
  return { width, height, rgb };
}

function toneMapSky(rgb: Float32Array, exposure: number): Buffer {
  const out = Buffer.alloc(rgb.length);
  for (let i = 0; i < rgb.length; i++) {
    const v = rgb[i] * exposure;
    const mapped = v / (1 + v);
    out[i] = Math.max(0, Math.min(255, Math.round(mapped ** (1 / 2.2) * 255)));
  }
  return out;
}

async function ktxFromPng(png: Buffer, oetf: 'srgb' | 'linear', encode: 'uastc' | 'etc1s'): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'kickole-ktx-'));
  try {
    const input = join(dir, 'in.png');
    const output = join(dir, 'out.ktx2');
    writeFileSync(input, png);
    const args = ['--genmipmap', '--encode', encode, '--assign_oetf', oetf];
    if (encode === 'uastc') args.push('--uastc_quality', '1');
    else args.push('--clevel', '2', '--qlevel', '128');
    args.push(output, input);
    execFileSync(TOKTX, args, {
      stdio: 'pipe',
      env: { ...process.env, LD_LIBRARY_PATH: `${KTX_LIB}:${process.env.LD_LIBRARY_PATH ?? ''}` },
    });
    return readFileSync(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function writeGround(slug: string, name: string) {
  const diff = await sharp(join(src, `${slug}_diff.jpg`)).resize(1024, 1024).png().toBuffer();
  const low = await sharp(join(src, `${slug}_diff.jpg`)).resize(512, 512).png().toBuffer();
  const nor = await sharp(join(src, `${slug}_nor.jpg`)).resize(512, 512).png().toBuffer();
  const rough = await sharp(join(src, `${slug}_rough.jpg`)).resize(512, 512).png().toBuffer();
  const color = await ktxFromPng(diff, 'srgb', 'etc1s');
  const colorLow = await ktxFromPng(low, 'srgb', 'etc1s');
  const normal = await ktxFromPng(nor, 'linear', 'uastc');
  const roughKtx = await ktxFromPng(rough, 'linear', 'etc1s');
  writeFileSync(join(outTex, `${name}_color.ktx2`), color);
  writeFileSync(join(outTex, `${name}_color_low.ktx2`), colorLow);
  writeFileSync(join(outTex, `${name}_normal.ktx2`), normal);
  writeFileSync(join(outTex, `${name}_rough.ktx2`), roughKtx);
  console.log(name, 'color', color.length, 'low', colorLow.length, 'normal', normal.length, 'rough', roughKtx.length);
}

function countTriangles(doc: import('@gltf-transform/core').Document): number {
  let count = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) count += (prim.getIndices()?.getCount() ?? 0) / 3;
  }
  return count;
}

async function compositeAlpha(textureImage: Uint8Array, alphaPath: string): Promise<Buffer> {
  const base = sharp(Buffer.from(textureImage));
  const meta = await base.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const alpha = await sharp(alphaPath).resize(width, height).ensureAlpha().extractChannel(0).raw().toBuffer();
  const rgb = await base.removeAlpha().raw().toBuffer();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3];
    rgba[i * 4 + 1] = rgb[i * 3 + 1];
    rgba[i * 4 + 2] = rgb[i * 3 + 2];
    rgba[i * 4 + 3] = alpha[i];
  }
  return sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

async function writeModel(job: ModelJob) {
  const io = new NodeIO()
    .registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression])
    .registerDependencies({
      'meshopt.encoder': MeshoptEncoder,
    });
  const doc = await io.read(join(src, 'models', job.slug, `${job.slug}_1k.gltf`));
  const before = countTriangles(doc);
  const ratio = Math.min(1, job.triangles / Math.max(1, before));
  if (ratio < 0.98) {
    await doc.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.01 }),
      prune(),
    );
  }
  if (job.alpha) {
    const alphaPath = join(src, job.alpha);
    for (const material of doc.getRoot().listMaterials()) {
      const texture = material.getBaseColorTexture();
      const image = texture?.getImage();
      if (!texture || !image) continue;
      const png = await compositeAlpha(image, alphaPath);
      texture.setImage(new Uint8Array(png));
      texture.setMimeType('image/png');
    }
  }
  const basisu = doc.createExtension(KHRTextureBasisu).setRequired(true);
  void basisu;
  for (const texture of doc.getRoot().listTextures()) {
    const image = texture.getImage();
    if (!image) continue;
    let role: 'color' | 'normal' | 'data' = 'data';
    for (const material of doc.getRoot().listMaterials()) {
      if (material.getBaseColorTexture() === texture) role = 'color';
      if (material.getNormalTexture() === texture) role = 'normal';
    }
    const png = await sharp(Buffer.from(image)).resize(512, 512, { fit: 'inside' }).png().toBuffer();
    const hasAlpha = (await sharp(png).metadata()).channels === 4;
    const encode = role === 'color' && !hasAlpha ? 'etc1s' : 'uastc';
    const oetf = role === 'color' ? 'srgb' : 'linear';
    const compressed = await ktxFromPng(png, oetf, encode);
    texture.setImage(compressed);
    texture.setMimeType('image/ktx2');
  }
  await doc.transform(
    dedup(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const dest = join(outModel, job.file);
  await io.write(dest, doc);
  const bytes = readFileSync(dest).length;
  console.log(job.file, 'tris', before, '->', countTriangles(doc), 'bytes', bytes);
}

async function main() {
  mkdirSync(outTex, { recursive: true });
  mkdirSync(outModel, { recursive: true });
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  for (const [srcName, hdrName, jpgName] of HDRS) {
    const hdr = readFileSync(join(src, srcName));
    writeFileSync(join(outTex, hdrName), hdr);
    const decoded = decodeRGBE(hdr);
    const raw = toneMapSky(decoded.rgb, 0.85);
    const jpg = await sharp(raw, { raw: { width: decoded.width, height: decoded.height, channels: 3 } })
      .resize(1024, 512)
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer();
    writeFileSync(join(outTex, jpgName), jpg);
    console.log(hdrName, hdr.length, jpgName, jpg.length, decoded.width, decoded.height);
  }
  await writeGround('sand_03', 'sand');
  await writeGround('rubberized_track', 'track');
  await writeGround('grass_ground', 'grass');
  if (process.env.SKIP_MODELS === '1') return;
  for (const job of MODELS) await writeModel(job);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
