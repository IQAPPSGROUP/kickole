import { describe, expect, it } from 'vitest';
import { characterModelUrl } from './rig';
import {
  MAX_PIXEL_RATIO,
  cappedDpr,
  characterLod,
  createFpsGuard,
  detectTier,
  gpuTier,
  isFlagshipGpu,
  profileFor,
  resolveTier,
  stepFpsGuard,
  useMsaa,
} from './qualityTier';

describe('quality tiers', () => {
  it('detects low, mid and high devices from the CPU when the GPU is unknown', () => {
    expect(detectTier({ cores: 4, memoryGb: 2 })).toBe('low');
    expect(detectTier({ cores: 6, memoryGb: 4 })).toBe('medium');
    expect(detectTier({ cores: 8, memoryGb: 8 })).toBe('high');
    expect(detectTier({ cores: 8 })).toBe('high');
  });

  it('classifies GPU names and lets a weak GPU win', () => {
    expect(gpuTier('ANGLE (NVIDIA, NVIDIA GeForce RTX 4070)')).toBe('high');
    expect(gpuTier('ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)')).toBe('high');
    expect(gpuTier('Apple GPU')).toBe('high');
    expect(gpuTier('Apple A16 GPU')).toBe('high');
    expect(gpuTier('Apple A15 GPU')).toBe('high');
    expect(gpuTier('Apple A14 GPU')).toBe('medium');
    expect(gpuTier('Apple A11 GPU')).toBe('low');
    expect(gpuTier('Adreno (TM) 740')).toBe('high');
    expect(gpuTier('Adreno (TM) 610')).toBe('medium');
    expect(gpuTier('Adreno (TM) 505')).toBe('low');
    expect(gpuTier('Mali-G710')).toBe('high');
    expect(gpuTier('Immortalis-G715')).toBe('high');
    expect(gpuTier('Mali-G78')).toBe('high');
    expect(gpuTier('Mali-G52')).toBe('medium');
    expect(gpuTier('Mali-T880')).toBe('low');
    expect(gpuTier('Intel(R) Iris(R) Xe Graphics')).toBe('high');
    expect(gpuTier('Intel(R) UHD Graphics')).toBe('medium');
    expect(gpuTier('Intel(R) HD Graphics 4000')).toBe('low');
    expect(gpuTier('llvmpipe (LLVM 15.0.7, 256 bits)')).toBe('low');
    expect(gpuTier('')).toBeNull();
    expect(detectTier({ cores: 16, memoryGb: 16, gpu: 'llvmpipe' })).toBe('low');
    expect(detectTier({ cores: 8, memoryGb: 8, gpu: 'NVIDIA GeForce RTX 3060' })).toBe('high');
    expect(detectTier({ cores: 6, memoryGb: 4, gpu: 'Apple GPU' })).toBe('medium');
    expect(isFlagshipGpu('Apple GPU')).toBe(false);
    expect(detectTier({ cores: 4, memoryGb: 4, gpu: 'Apple A16 GPU' })).toBe('high');
    expect(detectTier({ cores: 6, memoryGb: 4, gpu: 'Apple A14 GPU' })).toBe('medium');
    expect(detectTier({ cores: 8, memoryGb: 4, gpu: 'Adreno (TM) 740' })).toBe('high');
    expect(detectTier({ cores: 8, memoryGb: 4, gpu: 'Adreno (TM) 660' })).toBe('high');
    expect(detectTier({ cores: 8, memoryGb: 4, gpu: 'Adreno (TM) 619' })).toBe('medium');
    expect(isFlagshipGpu('Adreno (TM) 660')).toBe(true);
    expect(isFlagshipGpu('Adreno (TM) 619')).toBe(false);
    expect(detectTier({ cores: 8, memoryGb: 4, gpu: 'Mali-G710' })).toBe('high');
    expect(detectTier({ cores: 6, memoryGb: 4, gpu: 'Immortalis-G715' })).toBe('high');
    expect(isFlagshipGpu('Apple A15 GPU')).toBe(true);
    expect(isFlagshipGpu('Apple A14 GPU')).toBe(false);
    expect(detectTier({ cores: 8, memoryGb: 8, gpu: 'Adreno (TM) 505' })).toBe('low');
  });

  it('uses auto as the device tier and an explicit choice as the saved tier', () => {
    expect(resolveTier('auto', 'low')).toBe('low');
    expect(resolveTier('auto', 'high')).toBe('high');
    expect(resolveTier('high', 'low')).toBe('high');
    expect(resolveTier('low', 'high')).toBe('low');
    expect(resolveTier('medium', 'high')).toBe('medium');
  });

  it('drops one tier only after five seconds under 30 fps', () => {
    const high = createFpsGuard();
    expect(stepFpsGuard(high, 'high', 48, 0.2)).toBe('high');
    let tier: 'low' | 'medium' | 'high' = 'high';
    for (let i = 0; i < 24; i++) tier = stepFpsGuard(high, tier, 20, 0.2);
    expect(tier).toBe('high');
    expect(high.underSec).toBeCloseTo(4.8);
    expect(stepFpsGuard(high, tier, 20, 0.2)).toBe('medium');

    const recovered = createFpsGuard();
    for (let i = 0; i < 20; i++) stepFpsGuard(recovered, 'medium', 18, 0.2);
    expect(stepFpsGuard(recovered, 'medium', 36, 0.016)).toBe('medium');
    expect(recovered.underSec).toBe(0);
    for (let i = 0; i < 24; i++) stepFpsGuard(recovered, 'medium', 18, 0.2);
    expect(recovered.underSec).toBeCloseTo(4.8);

    const stalled = createFpsGuard();
    for (let i = 0; i < 10; i++) stepFpsGuard(stalled, 'high', 10, 0.2);
    expect(stepFpsGuard(stalled, 'high', 10, 2)).toBe('high');
    expect(stalled.underSec).toBe(0);

    const floor = createFpsGuard();
    expect(stepFpsGuard(floor, 'low', 12, 0.2)).toBe('low');
    let dropped: 'low' | 'medium' | 'high' = 'medium';
    for (let i = 0; i < 25; i++) dropped = stepFpsGuard(floor, dropped, 12, 0.2);
    expect(dropped).toBe('low');
  });

  it('selects the heavy player on mid and high, and the mobile LOD on low', () => {
    expect(characterLod('high')).toBe(0);
    expect(characterLod('medium')).toBe(0);
    expect(characterLod('low')).toBe(1);
    expect(profileFor('low').ssao).toBe(false);
    expect(profileFor('low').aa).toBe('none');
    expect(profileFor('high').shadows).toBe('tight');
    expect(profileFor('high').shadowFilter).toBe('pcss');
    expect(profileFor('high').contactShadows).toBe(false);
    expect(profileFor('low').contactShadows).toBe(false);
    expect(profileFor('medium').contactShadows).toBe(false);
    expect(profileFor('medium').shadowFilter).toBe('vsm');
    expect(profileFor('medium').ibl).toBe(true);
    expect(profileFor('medium').bloom).toBe(false);
    expect(profileFor('medium').aa).toBe('fxaa');
    expect(profileFor('high').ssao).toBe(true);
    expect(profileFor('high').bloom).toBe(true);
    expect(profileFor('high').dof).toBe(true);
    expect(profileFor('high').aa).toBe('smaa');
    expect(profileFor('high').shadowExtent).toBeLessThan(profileFor('medium').shadowExtent);
    expect(characterModelUrl(0)).toMatch(/kickole_player_v4\.glb$/);
    expect(characterModelUrl(1)).toMatch(/kickole_player_v4_lod1\.glb$/);
    expect(characterModelUrl(0, 'female')).toMatch(/kickole_player_v4_female\.glb$/);
    expect(characterModelUrl(1, 'female')).toMatch(/kickole_player_v4_female_lod1\.glb$/);
  });

  it('caps the framebuffer at two device pixels and leaves MSAA off', () => {
    expect(useMsaa()).toBe(false);
    expect(cappedDpr([1, 3])).toEqual([1, 2]);
    for (const tier of ['low', 'medium', 'high'] as const) {
      const dpr = profileFor(tier).dpr;
      expect(dpr[0]).toBeLessThanOrEqual(MAX_PIXEL_RATIO);
      expect(dpr[1]).toBeLessThanOrEqual(MAX_PIXEL_RATIO);
      expect(cappedDpr(dpr)).toEqual([dpr[0], dpr[1]]);
    }
  });
});
