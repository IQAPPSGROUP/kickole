import type { Appearance, PlayerBody } from './appearance';
import { getBoot, getKit, STARTER_BOOT_ID, STARTER_KIT_ID, type BootDesign, type KitDesign, type SurfacePattern } from './catalogue';
import { clothingFor, getKitColour, KIT_BOOT, type KitPattern } from './kitColours';
import { COWBOY_BOOT_ID, getOutfit, type OutfitPattern } from './outfits';

export interface Skin {
  id: string;
  name: string;
  clothing: { shirt: string; shirtTrim: string; shorts: string; socks: string };
  boots: { main: string; sole: string; lace: string; trim: string };
  body: { skin: string; hair: string };
  football: { base: string; panels: string };
  playerBody: PlayerBody;
  kitPattern: SurfacePattern;
  bootPattern: SurfacePattern;
  unlocked: boolean;
  productId: string | null;
  /** Themed costume. Null keeps the equipped kit colours. */
  outfitId?: string | null;
  /** Pale multiply on the skin photograph. Null leaves the face alone. */
  skinTint?: string | null;
  patternPaint?: OutfitPattern | null;
  /** Free kit sheet. Null when a costume replaces the football kit. */
  kitPaint?: { pattern: KitPattern; main: string; secondary: string } | null;
  bootStyle?: 'studs' | 'cowboy';
}

/**
 * Legacy catalogue kept for Settings migration and tests.
 * New wardrobe uses kits + free appearance; these remain as free starter looks.
 */
export const SKINS: Skin[] = [
  {
    id: 'kicky-teal',
    name: 'Kickolé Teal',
    clothing: { shirt: '#12BFA6', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#12BFA6' },
    boots: { main: '#EAF44A', sole: '#142D35', lace: '#2a211c', trim: '#12BFA6' },
    body: { skin: '#E8B48F', hair: '#2A1E1A' },
    football: { base: '#F8F9FB', panels: '#222831' },
    playerBody: 'male',
    kitPattern: 'plain',
    bootPattern: 'panels',
    unlocked: true,
    productId: null,
  },
  {
    id: 'coral-flash',
    name: 'Coral Flash',
    clothing: { shirt: '#FF805D', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#FF805D' },
    boots: { main: '#F7F5ED', sole: '#142D35', lace: '#2a211c', trim: '#FF805D' },
    body: { skin: '#8D5A3C', hair: '#16100E' },
    football: { base: '#F7F5ED', panels: '#FF805D' },
    playerBody: 'male',
    kitPattern: 'carnival',
    bootPattern: 'plain',
    unlocked: true,
    productId: null,
  },
  {
    id: 'lime-night',
    name: 'Lime Night',
    clothing: { shirt: '#EAF44A', shirtTrim: '#142D35', shorts: '#142D35', socks: '#EAF44A' },
    boots: { main: '#12BFA6', sole: '#F7F5ED', lace: '#2a211c', trim: '#EAF44A' },
    body: { skin: '#F2CDAA', hair: '#C9822B' },
    football: { base: '#EAF44A', panels: '#142D35' },
    playerBody: 'male',
    kitPattern: 'midnight',
    bootPattern: 'plain',
    unlocked: true,
    productId: null,
  },
];

export const DEFAULT_SKIN_ID = SKINS[0].id;

export function getSkin(id: string): Skin {
  const s = SKINS.find((k) => k.id === id);
  return s && s.unlocked ? s : SKINS[0];
}

/**
 * Merge free appearance + equipped kit + equipped boots into a render skin.
 * Boots/kits never change skin tone or hair colour.
 */
export function composePlayerSkin(
  appearance: Appearance,
  kitId: string = STARTER_KIT_ID,
  bootId: string = STARTER_BOOT_ID,
  preview?: { kit?: KitDesign | null; boot?: BootDesign | null; outfitId?: string | null },
): Skin {
  const kit = preview?.kit ?? getKit(kitId);
  const boot = preview?.boot ?? getBoot(bootId);
  const outfit = getOutfit(preview?.outfitId);
  const look = getKitColour(appearance.kitColourId);
  // A costume replaces the football kit. Otherwise the free kit sheet wins, including over a saved shop kit.
  const clothing = outfit ? { ...outfit.clothing } : look ? clothingFor(look) : { ...appearance.clothing };
  const cowboy = boot.id === COWBOY_BOOT_ID;
  return {
    id: `live:${outfit?.id ?? kit.id}:${boot.id}:${appearance.body}`,
    name: outfit ? `${outfit.name} · ${boot.name}` : `${kit.name} · ${boot.name}`,
    clothing,
    boots: outfit ? {
      main: boot.main,
      sole: boot.sole,
      lace: boot.lace,
      trim: boot.trim,
    } : {
      main: KIT_BOOT,
      sole: KIT_BOOT,
      lace: KIT_BOOT,
      trim: KIT_BOOT,
    },
    body: {
      skin: outfit?.skinTint ?? appearance.skinTone,
      hair: appearance.hairColor,
    },
    football: { base: '#F8F9FB', panels: '#222831' },
    playerBody: appearance.body,
    kitPattern: outfit ? 'plain' : kit.pattern,
    bootPattern: boot.pattern,
    unlocked: true,
    productId: null,
    outfitId: outfit?.id ?? null,
    skinTint: outfit?.skinTint ?? null,
    patternPaint: outfit?.pattern ?? null,
    kitPaint: outfit || !look ? null : { pattern: look.pattern, main: look.shirt, secondary: look.secondary },
    bootStyle: outfit && cowboy ? 'cowboy' : 'studs',
  };
}
