/**
 * Original sunny equirect for the street carnival. No download.
 * Radiance RGBE, 1024×512. The upper hemisphere is bright daylight;
 * the sun sits along the key-light direction.
 */
import { writeFileSync } from 'node:fs';

const WIDTH = 1024;
const HEIGHT = 512;
const SUN = normalize(6.2, 8.4, 2.4);

function normalize(x, y, z) {
  const len = Math.hypot(x, y, z);
  return [x / len, y / len, z / len];
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

export function sunnyRadiance(x, y, width = WIDTH, height = HEIGHT) {
  const u = (x + 0.5) / width;
  const v = (y + 0.5) / height;
  const theta = v * Math.PI;
  const phi = (u - 0.5) * Math.PI * 2;
  const dirY = Math.cos(theta);
  const horiz = Math.sin(theta);
  const dirX = horiz * Math.cos(phi);
  const dirZ = horiz * Math.sin(phi);
  if (dirY < 0) {
    const bounce = 0.55 + 0.2 * (dirY + 1);
    return [0.95 * bounce, 0.72 * bounce, 0.48 * bounce];
  }
  const up = Math.pow(dirY, 0.4);
  const horizon = [1.85, 1.55, 1.15];
  const zenith = [0.72, 1.05, 1.55];
  const r = mix(horizon[0], zenith[0], up) * 1.25;
  const g = mix(horizon[1], zenith[1], up) * 1.35;
  const b = mix(horizon[2], zenith[2], up) * 1.45;
  const sunDot = dirX * SUN[0] + dirY * SUN[1] + dirZ * SUN[2];
  const disk = Math.pow(Math.max(0, sunDot), 700) * 22;
  const glow = Math.pow(Math.max(0, sunDot), 6) * 1.8;
  return [r + disk + glow * 1.15, g + disk * 0.96 + glow, b + disk * 0.72 + glow * 0.65];
}

function floatToRgbe(r, g, b) {
  const peak = Math.max(r, g, b);
  if (!(peak > 1e-32)) return [0, 0, 0, 0];
  const exponent = Math.floor(Math.log2(peak)) + 1;
  const scale = Math.pow(2, exponent) / 256;
  return [
    Math.min(255, Math.round(r / scale)),
    Math.min(255, Math.round(g / scale)),
    Math.min(255, Math.round(b / scale)),
    exponent + 128,
  ];
}

function encodeChannel(values) {
  const out = [];
  let i = 0;
  while (i < values.length) {
    let run = 1;
    while (run < 127 && i + run < values.length && values[i + run] === values[i]) run += 1;
    if (run >= 4) {
      out.push(128 + run, values[i]);
      i += run;
      continue;
    }
    let dump = 1;
    while (i + dump < values.length && dump < 128) {
      let peek = 1;
      while (peek < 4 && i + dump + peek < values.length && values[i + dump + peek] === values[i + dump]) peek += 1;
      if (peek >= 4) break;
      dump += 1;
    }
    out.push(dump);
    for (let k = 0; k < dump; k += 1) out.push(values[i + k]);
    i += dump;
  }
  return out;
}

function encodeScanline(pixels) {
  const width = pixels.length / 4;
  const bytes = [2, 2, (width >> 8) & 255, width & 255];
  for (let channel = 0; channel < 4; channel += 1) {
    const values = [];
    for (let x = 0; x < width; x += 1) values.push(pixels[x * 4 + channel]);
    bytes.push(...encodeChannel(values));
  }
  return bytes;
}

export function encodeSunnyHdr(width = WIDTH, height = HEIGHT) {
  const header = `#?RADIANCE\n# original street carnival daylight\nFORMAT=32-bit_rle_rgbe\n\n-Y ${height} +X ${width}\n`;
  const body = [];
  for (let y = 0; y < height; y += 1) {
    const pixels = [];
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = sunnyRadiance(x, y, width, height);
      pixels.push(...floatToRgbe(r, g, b));
    }
    body.push(...encodeScanline(pixels));
  }
  const text = Buffer.from(header, 'ascii');
  return Buffer.concat([text, Buffer.from(body)]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2] ?? 'public/textures/street_day_1k.hdr';
  const hdr = encodeSunnyHdr();
  writeFileSync(target, hdr);
  console.log(`wrote ${target} ${hdr.length} bytes`);
}
