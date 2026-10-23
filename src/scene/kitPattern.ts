import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';
import type { KitPattern } from '../game/kitColours';

function canvas(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = 256;
  el.height = 256;
  return el.getContext('2d');
}

/**
 * All-over cloth from the kit sheet. Original blocks only: no crest, badge, flag or logo.
 * Plain kits return null and use the material tint.
 */
export function paintKitPattern(pattern: KitPattern, colours: readonly string[]): Texture | null {
  if (pattern === 'plain') return null;
  const g = canvas();
  if (!g) return null;
  const list = colours.length > 0 ? colours : ['#E4E0D8'];
  switch (pattern) {
    case 'stripes': {
      const width = 256 / list.length;
      list.forEach((colour, index) => {
        g.fillStyle = colour;
        g.fillRect(Math.floor(index * width), 0, Math.ceil(width) + 1, 256);
      });
      break;
    }
    case 'hoops': {
      const height = 256 / list.length;
      list.forEach((colour, index) => {
        g.fillStyle = colour;
        g.fillRect(0, Math.floor(index * height), 256, Math.ceil(height) + 1);
      });
      break;
    }
    case 'halves': {
      g.fillStyle = list[0];
      g.fillRect(0, 0, 128, 256);
      g.fillStyle = list[1] ?? list[0];
      g.fillRect(128, 0, 128, 256);
      break;
    }
    case 'sash': {
      g.fillStyle = list[0];
      g.fillRect(0, 0, 256, 256);
      g.fillStyle = list[1] ?? list[0];
      g.beginPath();
      g.moveTo(0, 20);
      g.lineTo(256, 150);
      g.lineTo(256, 210);
      g.lineTo(0, 80);
      g.closePath();
      g.fill();
      break;
    }
    default: {
      const neverPattern: never = pattern;
      return neverPattern;
    }
  }
  const map = new CanvasTexture(g.canvas);
  map.colorSpace = SRGBColorSpace;
  map.needsUpdate = true;
  return map;
}
