import { describe, expect, it } from 'vitest';
import { buildAoKernel } from './ssaoPass';

describe('SSAO kernel', () => {
  it('builds a fixed hemisphere', () => {
    const kernel = buildAoKernel();
    expect(kernel).toHaveLength(12);
    for (const sample of kernel) {
      expect(sample.z).toBeGreaterThan(0);
      expect(sample.length()).toBeLessThanOrEqual(1);
    }
    expect(buildAoKernel()[3].toArray()).toEqual(kernel[3].toArray());
  });
});