import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readBytes(file: string) {
  const buf = readFileSync(new URL(`../${file}`, import.meta.url));
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function pngSize(file: string) {
  const bytes = readBytes(file);
  const signature = Array.from(bytes.subarray(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
  expect(signature).toBe('89504e470d0a1a0a');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
    colorType: bytes[25],
  };
}

describe('app icon', () => {
  it('uses the 1024 RGB iOS icon and the Play 512 master', () => {
    const ios = pngSize('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png');
    expect(ios).toMatchObject({ width: 1024, height: 1024, colorType: 2 });
    const play = pngSize('android/app/src/main/ic_launcher-playstore.png');
    expect(play).toMatchObject({ width: 512, height: 512, colorType: 2 });
  });

  it('ships adaptive foregrounds inside the launcher densities, including round', () => {
    const legacy: Array<[string, number]> = [
      ['mipmap-mdpi', 48],
      ['mipmap-hdpi', 72],
      ['mipmap-xhdpi', 96],
      ['mipmap-xxhdpi', 144],
      ['mipmap-xxxhdpi', 192],
    ];
    const adaptive: Array<[string, number]> = [
      ['mipmap-mdpi', 108],
      ['mipmap-hdpi', 162],
      ['mipmap-xhdpi', 216],
      ['mipmap-xxhdpi', 324],
      ['mipmap-xxxhdpi', 432],
    ];
    for (const [dir, size] of legacy) {
      expect(pngSize(`android/app/src/main/res/${dir}/ic_launcher.png`)).toMatchObject({ width: size, height: size });
      expect(pngSize(`android/app/src/main/res/${dir}/ic_launcher_round.png`)).toMatchObject({ width: size, height: size, colorType: 6 });
    }
    for (const [dir, size] of adaptive) {
      expect(pngSize(`android/app/src/main/res/${dir}/ic_launcher_foreground.png`)).toMatchObject({ width: size, height: size, colorType: 6 });
      expect(pngSize(`android/app/src/main/res/${dir}/ic_launcher_background.png`)).toMatchObject({ width: size, height: size, colorType: 2 });
    }
  });

  it('publishes favicon, apple touch, and manifest icons', () => {
    expect(pngSize('public/icons/favicon-32.png')).toMatchObject({ width: 32, height: 32 });
    expect(pngSize('public/icons/apple-touch-icon.png')).toMatchObject({ width: 180, height: 180 });
    expect(pngSize('public/icons/icon-192.png')).toMatchObject({ width: 192, height: 192 });
    expect(pngSize('public/icons/icon-512.png')).toMatchObject({ width: 512, height: 512 });
    expect(pngSize('public/icons/icon-maskable-512.png')).toMatchObject({ width: 512, height: 512 });
    const manifest = JSON.parse(new TextDecoder().decode(readBytes('public/manifest.webmanifest'))) as { icons: Array<{ src: string }> };
    expect(manifest.icons.map((icon) => icon.src)).toEqual([
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/icon-maskable-512.png',
    ]);
  });
});
