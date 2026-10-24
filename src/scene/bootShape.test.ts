import { describe, expect, it } from 'vitest';
import { bootStyleSpecs } from '../game/outfitFit';
import { createBootGeometry } from './bootShape';

describe('boot loft', () => {
  it('rounds the toe and keeps the shaft top facing up', () => {
    const spec = bootStyleSpecs('boot-wellies', 'male').find((piece) => piece.name === 'wellie-shaft');
    if (!spec?.boot) throw new Error('missing wellie shaft');
    const geometry = createBootGeometry(spec.boot, spec.position);
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const span = spec.boot.toeZ - spec.boot.heelZ;
    let mid = 0;
    let toe = 0;
    let top = 0;
    let topY = -Infinity;
    for (let i = 0; i < position.count; i += 1) {
      const z = position.getZ(i) + spec.position[2];
      const along = (z - spec.boot.heelZ) / span;
      const x = Math.abs(position.getX(i));
      if (along > 0.3 && along < 0.48) mid = Math.max(mid, x);
      if (along > 0.9) toe = Math.max(toe, x);
      if (along > 0.08 && along < 0.4 && position.getY(i) > topY) {
        topY = position.getY(i);
        top = i;
      }
    }
    expect(mid).toBeGreaterThan(0.03);
    expect(toe).toBeLessThan(mid * 0.6);
    expect(normal.getY(top)).toBeGreaterThan(0.3);
    geometry.dispose();
  });
});
