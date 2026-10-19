import { useEffect, useState } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/** Painted props. Magenta in the source is the cut-out, removed before the texture is used. */
export const ART = {
  seagull: `${import.meta.env.BASE_URL}art/seagull.jpg`,
  frond: `${import.meta.env.BASE_URL}art/palm-frond.jpg`,
  ball: `${import.meta.env.BASE_URL}art/beach-ball.jpg`,
  awning: `${import.meta.env.BASE_URL}art/awning.jpg`,
  spectator: `${import.meta.env.BASE_URL}art/spectator.jpg`,
  clouds: `${import.meta.env.BASE_URL}art/beach-clouds.jpg`,
  coastalHill: `${import.meta.env.BASE_URL}art/coastal-hill.jpg`,
  towel: `${import.meta.env.BASE_URL}art/beach-towel.jpg`,
} as const;

function nearBackdrop(r: number, g: number, b: number, bgR: number, bgG: number, bgB: number): boolean {
  const dr = r - bgR;
  const dg = g - bgG;
  const db = b - bgB;
  return dr * dr + dg * dg + db * db < 90 * 90;
}

function cutout(img: HTMLImageElement): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  if (!g) return texture;
  g.drawImage(img, 0, 0);
  const frame = g.getImageData(0, 0, canvas.width, canvas.height);
  const px = frame.data;
  const bgR = px[0];
  const bgG = px[1];
  const bgB = px[2];
  for (let i = 0; i < px.length; i += 4) {
    if (nearBackdrop(px[i], px[i + 1], px[i + 2], bgR, bgG, bgB)) px[i + 3] = 0;
  }
  g.putImageData(frame, 0, 0);
  texture.needsUpdate = true;
  return texture;
}

/** Loads a painted image. `cut` removes the magenta backdrop so a plane can stand in the scene. */
export function useArtTexture(url: string, cut: boolean): CanvasTexture | null {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  useEffect(() => {
    let live = true;
    let made: CanvasTexture | null = null;
    const img = new Image();
    img.onload = () => {
      if (!live) return;
      if (!cut) {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext('2d')?.drawImage(img, 0, 0);
        made = new CanvasTexture(canvas);
        made.colorSpace = SRGBColorSpace;
        made.anisotropy = 8;
        made.needsUpdate = true;
      } else {
        made = cutout(img);
      }
      setTexture(made);
    };
    img.src = url;
    return () => {
      live = false;
      made?.dispose();
    };
  }, [url, cut]);
  return texture;
}
