/**
 * Original street mural painted over the CC0 concrete wall.
 * The lettering and shapes are made for Kickolé; the concrete photo is Poly Haven.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '../street-sources');
const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <g opacity="0.92">
    <rect x="70" y="140" width="360" height="220" rx="8" fill="#1c2430" opacity="0.55"/>
    <path d="M90 250 C180 160 250 300 340 190 C400 120 470 240 520 180" fill="none" stroke="#d7a15a" stroke-width="18" stroke-linecap="round"/>
    <circle cx="760" cy="250" r="90" fill="#8c3d45" opacity="0.8"/>
    <circle cx="790" cy="230" r="28" fill="#e6d2a8" opacity="0.85"/>
    <path d="M120 620 h180 l-30 70 h-120 z" fill="#3d6b62" opacity="0.75"/>
    <path d="M340 560 h70 v220 h-70 z" fill="#c4b49a" opacity="0.35"/>
    <path d="M430 700 C520 620 640 760 820 640" fill="none" stroke="#2a3340" stroke-width="22" stroke-linecap="round" opacity="0.7"/>
    <text x="110" y="470" font-family="Impact, sans-serif" font-size="120" fill="#e7e1d6" opacity="0.82" transform="rotate(-6 110 470)">RUA</text>
    <text x="560" y="820" font-family="Impact, sans-serif" font-size="92" fill="#d27a45" opacity="0.78" transform="rotate(4 560 820)">07</text>
    <g opacity="0.35" fill="#111">
      <circle cx="200" cy="180" r="3"/><circle cx="480" cy="400" r="2"/><circle cx="700" cy="640" r="3"/>
      <circle cx="300" cy="800" r="2"/><circle cx="860" cy="500" r="2"/>
    </g>
  </g>
</svg>`;

const concrete = await sharp(join(root, 'concrete_diff.jpg')).resize(1024, 1024).jpeg().toBuffer();
const painted = await sharp(concrete)
  .composite([{ input: Buffer.from(svg), blend: 'over' }])
  .jpeg({ quality: 78 })
  .toBuffer();
writeFileSync(join(root, 'wall_graffiti.jpg'), painted);
console.log('wall_graffiti.jpg', painted.length);
