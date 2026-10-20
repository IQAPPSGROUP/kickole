/**
 * Lighter alley for older phones. Rewrites the WebP images in
 * public/models/env/alley_game.glb. Draco meshes stay byte-for-byte.
 * Does not touch the purchased source.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const srcPath = new URL('../public/models/env/alley_game.glb', import.meta.url);
const outPath = new URL('../public/models/env/alley_game_low.glb', import.meta.url);
const src = readFileSync(srcPath);
if (src.toString('utf8', 0, 4) !== 'glTF') throw new Error('not a glb');
const jsonLen = src.readUInt32LE(12);
const json = JSON.parse(src.slice(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = src.subarray(binStart, binStart + src.readUInt32LE(20 + jsonLen));

const chunks = json.bufferViews.map((view) => bin.subarray(view.byteOffset, view.byteOffset + view.byteLength));
for (const image of json.images) {
  const name = image.name || '';
  const aux = /normal|rough|nor_|rough_/i.test(name);
  const maxEdge = aux ? 256 : 512;
  const quality = aux ? 52 : 70;
  const next = await sharp(chunks[image.bufferView])
    .resize(maxEdge, maxEdge, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality })
    .toBuffer();
  console.log(name, chunks[image.bufferView].length, '->', next.length);
  chunks[image.bufferView] = next;
}

let cursor = 0;
const binOut = Buffer.alloc(chunks.reduce((sum, chunk) => sum + chunk.length + 4, 0));
for (let i = 0; i < chunks.length; i++) {
  const pad = (4 - (cursor % 4)) % 4;
  cursor += pad;
  json.bufferViews[i].byteOffset = cursor;
  json.bufferViews[i].byteLength = chunks[i].length;
  chunks[i].copy(binOut, cursor);
  cursor += chunks[i].length;
}
const packed = binOut.subarray(0, cursor);
json.buffers[0].byteLength = packed.length;

const jsonBuf = Buffer.from(JSON.stringify(json));
const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
const jsonChunk = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
const binPad = (4 - (packed.length % 4)) % 4;
const binChunk = Buffer.concat([packed, Buffer.alloc(binPad)]);
const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
const out = Buffer.alloc(total);
out.write('glTF', 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonChunk.length, 12);
out.writeUInt32LE(0x4e4f534a, 16);
jsonChunk.copy(out, 20);
const binHeader = 20 + jsonChunk.length;
out.writeUInt32LE(binChunk.length, binHeader);
out.writeUInt32LE(0x004e4942, binHeader + 4);
binChunk.copy(out, binHeader + 8);
writeFileSync(outPath, out);
console.log('wrote', out.length);
