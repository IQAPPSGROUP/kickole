import { describe, expect, it } from 'vitest';
import {
  PITCH_BOX,
  PITCH_CENTRE,
  PITCH_CIRCLE_RADIUS,
  PITCH_GOAL,
  PITCH_HALFWAY,
  PITCH_LINE,
  PITCH_PLANE,
  PITCH_Y,
  fillPitch,
  pitchPlaneGeometry,
  pitchSample,
  pitchTextureSize,
} from './alleyPitch';

const FENCE_Z = -4.14;

describe('alley pitch markings', () => {
  it('rings the player with a halfway line through the centre spot', () => {
    const onCircle = pitchSample(PITCH_CENTRE.x + PITCH_CIRCLE_RADIUS, PITCH_CENTRE.z);
    const inside = pitchSample(PITCH_CENTRE.x + PITCH_CIRCLE_RADIUS * 0.45, PITCH_CENTRE.z + 0.2);
    const halfway = pitchSample(1.1, PITCH_HALFWAY.z);
    const beside = pitchSample(1.1, PITCH_HALFWAY.z + PITCH_LINE);
    expect(onCircle.a).toBeGreaterThan(120);
    expect(inside.a).toBe(0);
    expect(halfway.a).toBeGreaterThan(40);
    expect(beside.a).toBe(0);
    expect(PITCH_HALFWAY.z).toBe(PITCH_CENTRE.z);
    expect(Math.hypot(PITCH_CENTRE.x, PITCH_CENTRE.z - 0.16)).toBeLessThan(0.15);
  });

  it('paints part of a penalty box and goal area toward the back fence', () => {
    const front = pitchSample(0, PITCH_BOX.front);
    const side = pitchSample(PITCH_BOX.x1, (PITCH_BOX.front + PITCH_BOX.back) / 2);
    const goal = pitchSample(0, PITCH_GOAL.front);
    const open = pitchSample(0, (PITCH_CENTRE.z + PITCH_BOX.front) / 2);
    const pastFence = pitchSample(0, FENCE_Z - 0.05);
    expect(front.a).toBeGreaterThan(80);
    expect(side.a).toBeGreaterThan(80);
    expect(goal.a).toBeGreaterThan(80);
    expect(open.a).toBe(0);
    expect(pastFence.a).toBe(0);
    expect(PITCH_BOX.front).toBeLessThan(PITCH_CENTRE.z - PITCH_CIRCLE_RADIUS);
    expect(PITCH_BOX.back).toBeLessThan(PITCH_BOX.front);
    expect(PITCH_GOAL.back).toBeLessThan(PITCH_GOAL.front);
    expect(PITCH_BOX.back).toBeGreaterThan(FENCE_Z);
    expect(PITCH_GOAL.x0).toBeGreaterThan(PITCH_BOX.x0);
    expect(PITCH_GOAL.x1).toBeLessThan(PITCH_BOX.x1);
  });

  it('keeps the paint on the concrete, off-white, worn, and close to the floor', () => {
    const clean = pitchSample(-0.2, PITCH_HALFWAY.z);
    const chipped = pitchSample(0.35, PITCH_BOX.front);
    expect(clean.a).toBeGreaterThan(140);
    expect(clean.a).toBeLessThan(230);
    expect(clean.r).toBeGreaterThan(clean.b);
    expect(clean.g).toBeGreaterThan(150);
    expect(chipped.a).toBeLessThan(clean.a * 0.5);
    expect(PITCH_Y).toBeLessThan(0.01);
    expect(PITCH_Y).toBeGreaterThan(0);
    for (const [x, z] of [
      [PITCH_HALFWAY.x0, PITCH_HALFWAY.z],
      [PITCH_HALFWAY.x1, PITCH_HALFWAY.z],
      [PITCH_BOX.x0, PITCH_BOX.back],
      [PITCH_BOX.x1, PITCH_BOX.back],
      [PITCH_CENTRE.x - PITCH_CIRCLE_RADIUS, PITCH_CENTRE.z],
      [PITCH_CENTRE.x + PITCH_CIRCLE_RADIUS, PITCH_CENTRE.z],
    ] as const) {
      expect(x).toBeGreaterThan(PITCH_PLANE.x0);
      expect(x).toBeLessThan(PITCH_PLANE.x1);
      expect(z).toBeGreaterThan(PITCH_PLANE.z0);
      expect(z).toBeLessThan(PITCH_PLANE.z1);
      expect(z).toBeGreaterThan(FENCE_Z);
      expect(x).toBeLessThan(3.05);
    }
  });

  it('uses one smaller texture on the low tier and maps the decal toward the fence', () => {
    expect(pitchTextureSize('low')).toBe(512);
    expect(pitchTextureSize('medium')).toBe(1024);
    expect(pitchTextureSize('high')).toBe(1024);
    const painted = fillPitch(48, 56);
    let ink = 0;
    for (let i = 3; i < painted.length; i += 4) if ((painted[i] ?? 0) > 0) ink += 1;
    expect(ink).toBeGreaterThan(20);
    expect(ink).toBeLessThan(48 * 56 * 0.2);
    const geo = pitchPlaneGeometry();
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    let farV = -1;
    let nearV = 2;
    for (let i = 0; i < pos.count; i += 1) {
      const z = pos.getZ(i);
      const v = uv.getY(i);
      if (z < -3) farV = Math.max(farV, v);
      if (z > 1) nearV = Math.min(nearV, v);
      expect(pos.getY(i)).toBeCloseTo(PITCH_Y, 5);
    }
    expect(farV).toBe(1);
    expect(nearV).toBe(0);
    geo.dispose();
  });
});
