import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { GAMEPLAY_FOV, GAMEPLAY_TARGET, gameplayCameraPosition } from './gameplayCamera';
import { sampleOpeningCamera } from './openingCamera';

const aspects = [375 / 667, 390 / 844, 430 / 932, 844 / 390];

describe('opening camera endpoint', () => {
  for (const theme of ['beach', 'street'] as const) {
    for (const aspect of aspects) {
      it(`${theme} u=1 matches gameplay camera at aspect ${aspect.toFixed(3)}`, () => {
        const pos = new Vector3();
        const target = new Vector3();
        const end = gameplayCameraPosition(aspect);
        const fov = sampleOpeningCamera(1, aspect, theme, pos, target);
        expect(pos.distanceTo(end)).toBeLessThan(1e-6);
        expect(target.distanceTo(GAMEPLAY_TARGET)).toBeLessThan(1e-6);
        expect(fov).toBe(GAMEPLAY_FOV);
      });
    }
  }

  it('keeps the camera in front of beach scenery during the pan', () => {
    const pos = new Vector3();
    const target = new Vector3();
    const aspect = 390 / 844;
    for (let i = 0; i <= 20; i++) {
      sampleOpeningCamera(i / 20, aspect, 'beach', pos, target);
      expect(pos.z).toBeGreaterThan(1.2);
      expect(pos.y).toBeGreaterThan(1.4);
      // Looking into the set, not behind unfinished backs.
      expect(target.z).toBeLessThan(pos.z);
    }
  });

  it('start pose differs from the gameplay framing so scenery is revealed', () => {
    const pos = new Vector3();
    const target = new Vector3();
    const aspect = 390 / 844;
    const end = gameplayCameraPosition(aspect);
    sampleOpeningCamera(0, aspect, 'beach', pos, target);
    expect(pos.distanceTo(end)).toBeGreaterThan(1.5);
    expect(target.distanceTo(GAMEPLAY_TARGET)).toBeGreaterThan(2);
  });
});
