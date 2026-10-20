import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import {
  STREET_BLOOM,
  STREET_EXPOSURE,
  displayLuminance,
  meanStreetLuminance,
  streetDaylightSamples,
  streetPostPassNames,
} from './daylight';
import { profileFor } from './qualityTier';

describe('street daylight', () => {
  it('lifts the street into bright daylight without clipping the face', () => {
    const samples = streetDaylightSamples();
    const sunlit = displayLuminance(samples.sunlit);
    const shadow = displayLuminance(samples.shadow);
    const court = displayLuminance(samples.court);
    const sky = displayLuminance(samples.sky);
    const mean = meanStreetLuminance(samples);
    expect(STREET_EXPOSURE).toBeGreaterThan(1.3);
    expect(mean).toBeGreaterThan(0.55);
    expect(mean).toBeLessThan(0.88);
    expect(sunlit).toBeGreaterThan(0.55);
    expect(sunlit).toBeLessThan(0.9);
    expect(shadow).toBeGreaterThan(0.42);
    expect(court).toBeGreaterThan(0.45);
    expect(sky).toBeGreaterThan(0.72);
    expect(sunlit).toBeGreaterThan(shadow);
  });

  it('keeps bloom in linear light, ahead of AgX, on every tier that blooms', () => {
    for (const tier of ['low', 'medium', 'high'] as const) {
      const names = streetPostPassNames(profileFor(tier));
      expect(names.indexOf('agx')).toBeGreaterThan(0);
      expect(names.indexOf('grade')).toBe(names.indexOf('agx') + 1);
      if (profileFor(tier).bloom) {
        expect(names.indexOf('bloom')).toBeGreaterThan(0);
        expect(names.indexOf('bloom')).toBeLessThan(names.indexOf('agx'));
      }
      const aa = names.indexOf('smaa') >= 0 ? names.indexOf('smaa') : names.indexOf('fxaa');
      if (aa >= 0) expect(aa).toBeGreaterThan(names.indexOf('grade'));
    }
    expect(STREET_BLOOM.threshold).toBeGreaterThan(1);
  });

  it('ships a bright sunny sky rather than a dusk HDR', () => {
    const file = readFileSync(new URL('../../public/textures/street_day_1k.hdr', import.meta.url));
    const parsed = new HDRLoader().parse(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
    const data = parsed.data as Float32Array;
    const width = parsed.width ?? 1024;
    const height = parsed.height ?? 512;
    let sky = 0;
    let skyCount = 0;
    let peak = 0;
    for (let y = 0; y < height / 2; y += 2) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        const luma = data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
        sky += luma;
        skyCount += 1;
        peak = Math.max(peak, luma);
      }
    }
    expect(sky / skyCount).toBeGreaterThan(1.15);
    expect(peak).toBeGreaterThan(6);
  });
});