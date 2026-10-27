import type { Color, Material } from 'three';
import type { Skin } from '../game/skins';
import { MATERIAL_NAMES } from './rig';

type ColouredMaterial = Material & { color?: Color };

/** Hex written onto the Skin or Hair material. Other materials are left alone. */
export function wardrobeBodyHex(name: string, skin: Skin): string | null {
  if (name === MATERIAL_NAMES.skin) return skin.body.skin;
  if (name === MATERIAL_NAMES.hair) return skin.body.hair;
  return null;
}

/** The colour the renderer multiplies into the skin and hair maps. */
export function applyWardrobeBodyColours(materials: readonly Material[], skin: Skin): void {
  for (const material of materials) {
    const hex = wardrobeBodyHex(material.name, skin);
    const colored = material as ColouredMaterial;
    if (!hex || !colored.color) continue;
    colored.color.set(hex);
  }
}
