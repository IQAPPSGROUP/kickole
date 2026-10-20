import { describe, expect, it } from 'vitest';
import { characterModelUrl } from './rig';
import { characterLod, detectTier, fallbackTier, profileFor, startingTier } from './qualityTier';

describe('quality tiers', () => {
  it('detects low, mid and high devices', () => {
    expect(detectTier({ cores: 4, memoryGb: 2 })).toBe('low');
    expect(detectTier({ cores: 6, memoryGb: 4 })).toBe('medium');
    expect(detectTier({ cores: 8, memoryGb: 8 })).toBe('high');
    expect(detectTier({ cores: 8 })).toBe('high');
    expect(detectTier({
      cores: 4,
      memoryGb: 4,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      screenWidth: 393,
      dpr: 3,
    })).toBe('high');
    expect(detectTier({
      cores: 4,
      memoryGb: 2,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)',
      screenWidth: 375,
      dpr: 2,
    })).toBe('medium');
    expect(detectTier({ cores: 8, memoryGb: 6, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' })).toBe('high');
    expect(detectTier({ cores: 4, memoryGb: 3, userAgent: 'Mozilla/5.0 (Linux; Android 12)' })).toBe('low');
  });

  it('treats the saved quality as a ceiling', () => {
    expect(startingTier('high', 'low')).toBe('low');
    expect(startingTier('low', 'high')).toBe('low');
    expect(startingTier('medium', 'high')).toBe('medium');
  });

  it('drops high below 60 fps and every tier below a 30 fps floor', () => {
    expect(fallbackTier('high', 59)).toBe('high');
    expect(fallbackTier('high', 48)).toBe('medium');
    expect(fallbackTier('medium', 31)).toBe('medium');
    expect(fallbackTier('medium', 24)).toBe('low');
    expect(fallbackTier('low', 18)).toBe('low');
  });

  it('selects the heavy player on mid and high, and the mobile LOD on low', () => {
    expect(characterLod('high')).toBe(0);
    expect(characterLod('medium')).toBe(0);
    expect(characterLod('low')).toBe(1);
    expect(profileFor('low').ssao).toBe(false);
    expect(profileFor('high').shadows).toBe('cascaded');
    expect(profileFor('medium').ibl).toBe(true);
    expect(profileFor('medium').bloom).toBe(false);
    expect(profileFor('high').ssao).toBe(true);
    expect(profileFor('high').bloom).toBe(true);
    expect(profileFor('high').dof).toBe(true);
    expect(profileFor('high').shadowFilter).toBe('variance');
    expect(profileFor('medium').shadowFilter).toBe('soft');
    expect(profileFor('low').shadowFilter).toBe('none');
    expect(profileFor('high').courtMaps).toBe('full');
    expect(profileFor('high').fence).toBe('link');
    expect(profileFor('high').sky).toBe('hdri');
    expect(profileFor('high').lamp).toBe('lit');
    expect(profileFor('high').crowdIdle).toBe(true);
    expect(profileFor('medium').courtMaps).toBe('rough');
    expect(profileFor('medium').fence).toBe('sparse');
    expect(profileFor('medium').sky).toBe('reflect');
    expect(profileFor('medium').decals).toBe(true);
    expect(profileFor('low').courtMaps).toBe('color');
    expect(profileFor('low').fence).toBe('plane');
    expect(profileFor('low').sky).toBe('flat');
    expect(profileFor('low').decals).toBe(false);
    expect(profileFor('low').crowdIdle).toBe(false);
    expect(profileFor('high').crowd).toBeGreaterThan(profileFor('medium').crowd);
    expect(profileFor('medium').crowd).toBeGreaterThan(profileFor('low').crowd);
    expect(characterModelUrl(0)).toMatch(/kickole_player_v4\.glb$/);
    expect(characterModelUrl(1)).toMatch(/kickole_player_v4_lod1\.glb$/);
    expect(characterModelUrl(0, 'female')).toMatch(/kickole_player_v4_female\.glb$/);
    expect(characterModelUrl(1, 'female')).toMatch(/kickole_player_v4_female_lod1\.glb$/);
  });
});