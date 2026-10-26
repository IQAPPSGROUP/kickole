import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const masters = path.join(root, 'assets/app-icon');
const icon1024 = path.join(masters, 'icon_1024.png');
const play512 = path.join(masters, 'play_icon_512.png');
const artPath = path.join(masters, 'icon_art_K2_transparent.png');

const legacy = [
  ['mipmap-mdpi', 48],
  ['mipmap-hdpi', 72],
  ['mipmap-xhdpi', 96],
  ['mipmap-xxhdpi', 144],
  ['mipmap-xxxhdpi', 192],
];
const adaptive = [
  ['mipmap-mdpi', 108],
  ['mipmap-hdpi', 162],
  ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324],
  ['mipmap-xxxhdpi', 432],
];

const SAFE_DIAMETER = 66 / 108;

async function concretePlate(size) {
  const border = 110;
  const { data, info } = await sharp(icon1024).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = info.width;
  const out = Buffer.alloc(width * width * 3);
  for (let y = 0; y < width; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sx = x;
      let sy = y;
      if (x > border && x < width - border) sx = x < width / 2 ? border : width - border - 1;
      if (y > border && y < width - border) sy = y < width / 2 ? border : width - border - 1;
      const source = (sy * width + sx) * 3;
      const dest = (y * width + x) * 3;
      out[dest] = data[source];
      out[dest + 1] = data[source + 1];
      out[dest + 2] = data[source + 2];
    }
  }
  return sharp(out, { raw: { width, height: width, channels: 3 } })
    .blur(2)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function trimmedArt() {
  const { data, info } = await sharp(artPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = info.width;
  let minY = info.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const pad = 8;
  const left = Math.max(0, minX - pad);
  const top = Math.max(0, minY - pad);
  const width = Math.min(info.width - left, maxX - minX + 1 + pad * 2);
  const height = Math.min(info.height - top, maxY - minY + 1 + pad * 2);
  return sharp(artPath).extract({ left, top, width, height }).png().toBuffer();
}

async function foreground(size, art) {
  const { data, info } = await sharp(art).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = (info.width - 1) / 2;
  const cy = (info.height - 1) / 2;
  let maxR = 1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16) {
        const radius = Math.hypot(x - cx, y - cy);
        if (radius > maxR) maxR = radius;
      }
    }
  }
  const safeRadius = (size * SAFE_DIAMETER) / 2;
  const scale = safeRadius / maxR;
  const resizedWidth = Math.max(1, Math.round(info.width * scale));
  const resizedHeight = Math.max(1, Math.round(info.height * scale));
  const resized = await sharp(art).resize(resizedWidth, resizedHeight).png().toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{
      input: resized,
      left: Math.round((size - resizedWidth) / 2),
      top: Math.round((size - resizedHeight) / 2),
    }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function circleMask(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`,
  );
}

async function writePng(file, buffer) {
  await mkdir(path.dirname(file), { recursive: true });
  await sharp(buffer).png({ compressionLevel: 9 }).toFile(file);
}

async function assertInsideSafeZone(buffer, size) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cx = (info.width - 1) / 2;
  const cy = (info.height - 1) / 2;
  const limit = (size * SAFE_DIAMETER) / 2 + 1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      if (data[(y * info.width + x) * 4 + 3] > 16 && Math.hypot(x - cx, y - cy) > limit) {
        throw new Error(`Foreground pixel outside the adaptive safe zone at ${x},${y}`);
      }
    }
  }
}

const art = await trimmedArt();
const androidRes = path.join(root, 'android/app/src/main/res');

for (const [dir, size] of legacy) {
  const square = await sharp(icon1024).resize(size, size).png().toBuffer();
  const round = await sharp(square).composite([{ input: circleMask(size), blend: 'dest-in' }]).png().toBuffer();
  await writePng(path.join(androidRes, dir, 'ic_launcher.png'), square);
  await writePng(path.join(androidRes, dir, 'ic_launcher_round.png'), round);
}

for (const [dir, size] of adaptive) {
  const back = await concretePlate(size);
  const front = await foreground(size, art);
  await assertInsideSafeZone(front, size);
  await writePng(path.join(androidRes, dir, 'ic_launcher_background.png'), back);
  await writePng(path.join(androidRes, dir, 'ic_launcher_foreground.png'), front);
}

await copyFile(icon1024, path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png'));
await copyFile(play512, path.join(root, 'android/app/src/main/ic_launcher-playstore.png'));

const web = path.join(root, 'public/icons');
await mkdir(web, { recursive: true });
await sharp(icon1024).resize(32, 32).png({ compressionLevel: 9 }).toFile(path.join(web, 'favicon-32.png'));
await sharp(icon1024).resize(180, 180).png({ compressionLevel: 9 }).toFile(path.join(web, 'apple-touch-icon.png'));
await sharp(icon1024).resize(192, 192).png({ compressionLevel: 9 }).toFile(path.join(web, 'icon-192.png'));
await sharp(icon1024).resize(512, 512).png({ compressionLevel: 9 }).toFile(path.join(web, 'icon-512.png'));
const maskable = await sharp(await concretePlate(512)).composite([{ input: await foreground(512, art) }]).png().toBuffer();
await writePng(path.join(web, 'icon-maskable-512.png'), maskable);

const iosMeta = await sharp(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png')).metadata();
if (iosMeta.width !== 1024 || iosMeta.height !== 1024 || iosMeta.hasAlpha) {
  throw new Error(`iOS icon must be 1024 RGB without alpha, got ${iosMeta.width}x${iosMeta.height} alpha=${iosMeta.hasAlpha}`);
}

console.log('App icons written. Splash screens were not touched.');
