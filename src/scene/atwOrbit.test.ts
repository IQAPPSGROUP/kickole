import { describe, expect, it } from 'vitest';
import { atwFootOffset } from './atwOrbit';

describe('around-the-world foot path', () => {
  const radius = 0.11;

  it('starts under the ball, passes over the top, and returns underneath', () => {
    const setup = atwFootOffset(0.02, 1, radius);
    expect(setup.contact).toBe(true);
    expect(setup.y).toBeLessThan(-radius);

    const over = atwFootOffset(0.51, 1, radius);
    expect(over.contact).toBe(false);
    expect(over.y).toBeGreaterThan(radius + 0.08);
    expect(Math.abs(over.x)).toBeLessThan(0.08);

    const inside = atwFootOffset(0.16, 1, radius);
    const outside = atwFootOffset(0.86, 1, radius);
    expect(inside.x).toBeLessThan(-0.05);
    expect(outside.x).toBeGreaterThan(0.05);

    const mirror = atwFootOffset(0.16, -1, radius);
    expect(mirror.x).toBeGreaterThan(0.05);

    const catchFrame = atwFootOffset(0.97, 1, radius);
    expect(catchFrame.contact).toBe(true);
    expect(catchFrame.y).toBeLessThan(-radius);
  });
});
