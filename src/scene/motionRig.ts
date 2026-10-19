import { Euler, Quaternion, Vector3, type Object3D } from 'three';
import type { PlayerMotion } from './motion';

export interface MotionTargets {
  root: Object3D;
  spine?: Object3D; head?: Object3D; armLeft?: Object3D; armRight?: Object3D;
  footLeft?: Object3D; footRight?: Object3D;
}

/** Reversible additive layer: restore before the next mixer/procedural update, then apply. */
export function createMotionRig(targets: MotionTargets, options: { mirrorArmZ?: boolean } = {}) {
  const keys = ['root', 'spine', 'head', 'armLeft', 'armRight', 'footLeft', 'footRight'] as const;
  const entries = keys.flatMap(key => targets[key] ? [{ key, node: targets[key]!, q: new Quaternion(), p: new Vector3() }] : []);
  const euler = new Euler(), delta = new Quaternion();
  let applied = false;
  const restore = () => {
    if (!applied) return;
    for (const { node, q, p } of entries) { node.quaternion.copy(q); node.position.copy(p); }
    applied = false;
  };
  return {
    restore,
    apply(m: PlayerMotion, trackHead = true) {
      // Also safe for repeated sampling without an intervening mixer update.
      restore();
      for (const entry of entries) {
        const { key, node } = entry;
        entry.q.copy(node.quaternion); entry.p.copy(node.position);
        let x = 0, y = 0, z = 0;
        switch (key) {
          case 'root': node.position.x += m.rootX; node.position.y += m.rootY; y = m.rootYaw; break;
          case 'spine': x = m.spineX; y = m.spineY; z = m.spineZ; break;
          case 'head': x = trackHead ? m.headX : 0; y = trackHead ? m.headY : 0; z = m.headZ; break;
          case 'armLeft': x = m.leftX; y = m.leftY; z = m.leftZ; break;
          case 'armRight': x = m.rightX; y = m.rightY; z = m.rightZ; break;
          case 'footLeft': x = m.leftFoot; break;
          case 'footRight': x = m.rightFoot; break;
        }
        if (options.mirrorArmZ && (key === 'armLeft' || key === 'armRight')) z = -z;
        node.quaternion.multiply(delta.setFromEuler(euler.set(x, y, z)));
      }
      applied = true;
    },
  };
}
