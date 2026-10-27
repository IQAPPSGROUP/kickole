import { MeshBasicMaterial, MeshStandardMaterial, MeshToonMaterial, type Material, type Texture } from 'three';
import type { Skin } from '../game/skins';
import { applyWardrobeBodyColours } from './bodyColour';
import { applyKitClothShader, clearKitClothShader, type KitClothZone } from './kitShirtShader';
import { paintOutfitTexture } from './outfitTexture';
import { MATERIAL_NAMES, skinMaterialColors } from './rig';
import { bindSunsetToon, setToonTrim, type ToonRole } from './toon';

function toonRole(name: string): ToonRole {
  if (name === MATERIAL_NAMES.skin) return 'skin';
  if (name === MATERIAL_NAMES.shirt) return 'shirt';
  return 'flat';
}

type PreviewMaterial = MeshToonMaterial | MeshStandardMaterial | MeshBasicMaterial;

/**
 * First colour pass on the GLB player. Skin and hair take the wardrobe swatch.
 * Eyes and the mouth stay as authored.
 */
export function paintPreviewColours(materials: readonly Material[], skin: Skin): void {
  const colors = skinMaterialColors(skin);
  applyWardrobeBodyColours(materials, skin);
  for (const material of materials) {
    const name = material.name;
    if (name === MATERIAL_NAMES.skin || name === MATERIAL_NAMES.hair) continue;
    if (material.userData.facePhoto || material.userData.headPhoto) continue;
    const colored = material as PreviewMaterial;
    if (colors[name]) colored.color.set(colors[name]);
    if ((material as MeshToonMaterial).isMeshToonMaterial) {
      const toon = material as MeshToonMaterial;
      if (name !== MATERIAL_NAMES.skin) toon.map = null;
      bindSunsetToon(toon, toonRole(name), skin.clothing.shirtTrim);
      setToonTrim(toon, skin.clothing.shirtTrim);
    }
  }
}

/**
 * Kit pass, then the wardrobe swatches again. The kit pass used to put the file
 * colour back on skin. The colour left on the materials is what the renderer multiplies.
 */
export function paintKitClothColours(materials: readonly Material[], skin: Skin): Texture | null {
  const kitCloth = !skin.patternPaint && skin.kitPaint ? skin.kitPaint : null;
  const painted = skin.patternPaint
    ? paintOutfitTexture(skin.patternPaint, skin.clothing.shirt, skin.clothing.shirtTrim)
    : null;
  const mapHoldsColour = skin.patternPaint === 'stripes'
    || skin.patternPaint === 'chain'
    || skin.patternPaint === 'torn'
    || skin.patternPaint === 'gold';
  for (const material of materials) {
    const standard = material as MeshStandardMaterial;
    if (!standard.isMeshStandardMaterial) continue;
    if (standard.userData.baseMap === undefined) standard.userData.baseMap = standard.map ?? null;
    if (standard.userData.baseRough === undefined) standard.userData.baseRough = standard.roughness;
    if (standard.userData.baseMetal === undefined) standard.userData.baseMetal = standard.metalness;
    if (standard.userData.baseColor === undefined) standard.userData.baseColor = `#${standard.color.getHexString()}`;
    const cloth = material.name === MATERIAL_NAMES.shirt
      || material.name === MATERIAL_NAMES.shorts
      || material.name === MATERIAL_NAMES.socks
      || material.name === MATERIAL_NAMES.shirtTrim;
    const zone: KitClothZone | null = material.name === MATERIAL_NAMES.shirt
      ? 'shirt'
      : material.name === MATERIAL_NAMES.shirtTrim
        ? 'collar'
        : material.name === MATERIAL_NAMES.socks
          ? 'socks'
          : null;
    if (kitCloth && zone) {
      standard.map = null;
      standard.color.set('#ffffff');
      applyKitClothShader(standard, {
        pattern: kitCloth.pattern,
        main: kitCloth.main,
        secondary: kitCloth.secondary,
        socks: kitCloth.socks,
        trim: kitCloth.trim,
        zone,
        body: skin.playerBody,
      });
    } else if (cloth && painted) {
      standard.map = painted;
      if (mapHoldsColour) standard.color.set('#ffffff');
      if (skin.patternPaint === 'gold') {
        standard.roughness = 0.32;
        standard.metalness = 0.65;
      } else if (skin.patternPaint === 'leather') {
        standard.roughness = 0.45;
        standard.metalness = 0.18;
      }
    } else if (cloth) {
      if (zone) clearKitClothShader(standard);
      const tint = skinMaterialColors(skin)[material.name];
      standard.map = null;
      if (tint) standard.color.set(tint);
      standard.roughness = standard.userData.baseRough;
      standard.metalness = standard.userData.baseMetal;
    }
    standard.needsUpdate = true;
  }
  applyWardrobeBodyColours(materials, skin);
  return painted;
}
