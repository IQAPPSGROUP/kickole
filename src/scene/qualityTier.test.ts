import { describe, expect, it } from 'vitest';
import { characterModelUrl } from './rig';
import { characterLod, detectTier, fallbackTier, profileFor, startingTier } from './qualityTier';

describe('quality tiers', () => {
  it('detects low, mid and high devices', () => {
    expect(detectTier({ cores: 4, memoryGb: 2 })).toBe('low');
    expect(detectTier({ cores: 6, memoryGb: 4 })).toBe('medium');
    expect(detectTier({ cores: 8, memoryGb: 8 })).toBe('high');
    expect(detectTier({ cores: 8 })).toBe('high');
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
    expect(characterModelUrl(0)).toMatch(/kickole_player_v4\.glb$/);
    expect(characterModelUrl(1)).toMatch(/kickole_player_v4_lod1\.glb$/);
  });
});