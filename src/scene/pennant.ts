import { BufferGeometry, Float32BufferAttribute, Object3D } from 'three';

/** Folded triangular pennant. The top edge is the attachment; the tip hangs down. */
export function createPennantGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute([
    -0.16, 0, 0,
    0, 0, 0.035,
    0, -0.36, 0.07,
    0, 0, 0.035,
    0.16, 0, 0,
    0, -0.36, 0.07,
  ], 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** A unit-height cylinder (Y up) stretched between two points of a sagging string. */
export function placeRope(
  dummy: Object3D,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) {
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.hypot(dx, dy, dz) || 0.001;
  dummy.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  dummy.scale.set(1, len, 1);
  dummy.lookAt(bx, by, bz);
  dummy.rotateX(Math.PI / 2);
  dummy.updateMatrix();
}
