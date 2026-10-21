import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { OutfitPattern } from '../game/outfits';

function canvas(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = 256;
  el.height = 256;
  return el.getContext('2d');
}

function textureFrom(draw: (g: CanvasRenderingContext2D) => void): Texture | null {
  const g = canvas();
  if (!g) return null;
  draw(g);
  const map = new CanvasTexture(g.canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}

/** Repeating cloth. UV placement on the footballer is uneven, so graphics stay all-over. */
export function paintOutfitTexture(pattern: OutfitPattern, primary: string, trim: string): Texture | null {
  return textureFrom((g) => {
    g.fillStyle = primary;
    g.fillRect(0, 0, 256, 256);
    if (pattern === 'weave' || pattern === 'leather' || pattern === 'snow' || pattern === 'night') {
      g.strokeStyle = trim;
      g.globalAlpha = pattern === 'leather' ? 0.35 : 0.22;
      g.lineWidth = 2;
      for (let y = 8; y < 256; y += 8) {
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(256, y + (y % 16 === 0 ? 2 : -2));
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (pattern === 'stripes') {
      g.fillStyle = trim;
      for (let x = 0; x < 256; x += 32) g.fillRect(x, 0, 14, 256);
    }
    if (pattern === 'chain') {
      g.strokeStyle = trim;
      g.lineWidth = 2;
      for (let y = 10; y < 256; y += 18) {
        for (let x = 10; x < 256; x += 18) {
          g.strokeRect(x, y, 10, 10);
        }
      }
    }
    if (pattern === 'torn') {
      g.fillStyle = trim;
      g.globalAlpha = 0.55;
      const patches = [[40, 30, 36, 28], [140, 80, 44, 22], [70, 160, 50, 30], [180, 150, 28, 36]];
      for (const [x, y, w, h] of patches) g.fillRect(x, y, w, h);
      g.globalAlpha = 1;
    }
    if (pattern === 'gold') {
      g.strokeStyle = '#FFF4C2';
      g.globalAlpha = 0.45;
      g.lineWidth = 10;
      for (let i = -256; i < 256; i += 48) {
        g.beginPath();
        g.moveTo(i, 0);
        g.lineTo(i + 180, 256);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    if (pattern === 'snow') {
      g.fillStyle = '#FFFFFF';
      g.globalAlpha = 0.7;
      for (let i = 0; i < 40; i += 1) {
        const x = (i * 47) % 256;
        const y = (i * 83) % 256;
        g.beginPath();
        g.arc(x, y, 3, 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
    }
  });
}
