/**
 * Kickolé wardrobe catalogue — earned boot styles and free kits.
 * Nothing in this list is sold. National kit colours are free and live in kitColours.ts.
 * Boot styles never alter timing windows or scoring. Progress stays on the device.
 */

import { BOOT_STYLES, CLASSIC_BOOT_ID, type BootStyleId } from './bootStyles';

export type UnlockTier = 'starter' | 'club' | 'street' | 'freestyle' | 'legend';

/** Lifetime play challenges; ATW/header/neck reserved until product asks for them. */
export type ChallengeKind = 'none' | 'alternateFoot' | 'stall' | 'perfectTouch';

export type SurfacePattern =
  | 'plain'
  | 'panels'
  | 'wave'
  | 'mosaic'
  | 'stripe'
  | 'gold'
  | 'midnight'
  | 'carnival'
  | 'cowboy';

export type DesignTheme =
  | 'Street Classic'
  | 'Carnival'
  | 'Beach Wave'
  | 'Midnight'
  | 'Mosaic'
  | 'Gold'
  | 'Cowboy';

export interface UnlockRequirement {
  tier: UnlockTier;
  challenge: ChallengeKind;
  /** Lifetime challenge count recorded on older saves. Nothing is sold against it. */
  challengeTarget: number;
}

export interface BootDesign {
  id: BootStyleId;
  name: string;
  theme: string;
  unlock: UnlockRequirement;
  main: string;
  sole: string;
  lace: string;
  trim: string;
  pattern: SurfacePattern;
  note: string;
}

export interface KitDesign {
  id: string;
  name: string;
  theme: DesignTheme;
  unlock: UnlockRequirement;
  clothing: { shirt: string; shirtTrim: string; shorts: string; socks: string };
  pattern: SurfacePattern;
  note: string;
}

/** Visual groupings for the old launch looks. They are not prices and they are not sold. */
export const UNLOCK_TIERS: Record<Exclude<UnlockTier, 'starter'>, UnlockRequirement> = {
  club: { tier: 'club', challenge: 'none', challengeTarget: 0 },
  street: { tier: 'street', challenge: 'alternateFoot', challengeTarget: 40 },
  freestyle: { tier: 'freestyle', challenge: 'stall', challengeTarget: 25 },
  legend: { tier: 'legend', challenge: 'perfectTouch', challengeTarget: 80 },
};

export const STARTER_BOOT_ID = CLASSIC_BOOT_ID;
export const STARTER_KIT_ID = 'kit-street-classic';

const FREE: UnlockRequirement = { tier: 'starter', challenge: 'none', challengeTarget: 0 };

/** Plain pairs. The written hint is the goal. Colour alone is not the lock. */
export const BOOTS: readonly BootDesign[] = BOOT_STYLES.map((style) => ({
  id: style.id,
  name: style.name,
  theme: style.name,
  unlock: FREE,
  main: style.main,
  sole: style.dark,
  lace: style.main,
  trim: style.dark,
  pattern: 'plain',
  note: style.hint,
}));

export const KITS: readonly KitDesign[] = [
  {
    id: STARTER_KIT_ID,
    name: 'Street Classic',
    theme: 'Street Classic',
    unlock: { tier: 'starter', challenge: 'none', challengeTarget: 0 },
    clothing: { shirt: '#FFD93D', shirtTrim: '#1E2A5A', shorts: '#1E2A5A', socks: '#F8F9FB' },
    pattern: 'plain',
    note: 'Starter kit. Included from the first run.',
  },
  {
    id: 'kit-beach-wave',
    name: 'Beach Wave',
    theme: 'Beach Wave',
    unlock: UNLOCK_TIERS.club,
    clothing: { shirt: '#3D7EA6', shirtTrim: '#F5E6C8', shorts: '#F7F5ED', socks: '#12BFA6' },
    pattern: 'wave',
    note: 'Coastal weave and sand trim.',
  },
  {
    id: 'kit-carnival',
    name: 'Carnival',
    theme: 'Carnival',
    unlock: UNLOCK_TIERS.club,
    clothing: { shirt: '#FF805D', shirtTrim: '#EAF44A', shorts: '#9B59B6', socks: '#FF805D' },
    pattern: 'carnival',
    note: 'Festival blocks across the shirt.',
  },
  {
    id: 'kit-midnight',
    name: 'Midnight',
    theme: 'Midnight',
    unlock: UNLOCK_TIERS.street,
    clothing: { shirt: '#1A1A2E', shirtTrim: '#12BFA6', shorts: '#142D35', socks: '#3D7EA6' },
    pattern: 'midnight',
    note: 'Night kit with teal accents.',
  },
  {
    id: 'kit-mosaic',
    name: 'Mosaic',
    theme: 'Mosaic',
    unlock: UNLOCK_TIERS.street,
    clothing: { shirt: '#F5C94D', shirtTrim: '#FF805D', shorts: '#142D35', socks: '#12BFA6' },
    pattern: 'mosaic',
    note: 'Broken-tile shirt print.',
  },
  {
    id: 'kit-gold',
    name: 'Gold',
    theme: 'Gold',
    unlock: UNLOCK_TIERS.legend,
    clothing: { shirt: '#F5C94D', shirtTrim: '#142D35', shorts: '#8B6914', socks: '#EAF44A' },
    pattern: 'gold',
    note: 'Launch legend kit.',
  },
];

export function isBootId(id: string): boolean {
  return BOOTS.some((b) => b.id === id);
}

export function isKitId(id: string): boolean {
  return KITS.some((k) => k.id === id);
}

export function getBoot(id: string): BootDesign {
  return BOOTS.find((b) => b.id === id) ?? BOOTS[0];
}

export function getKit(id: string): KitDesign {
  return KITS.find((k) => k.id === id) ?? KITS[0];
}

export function challengeLabel(kind: ChallengeKind): string {
  switch (kind) {
    case 'none': return '';
    case 'alternateFoot': return 'Alternating foot touches';
    case 'stall': return 'Foot stalls';
    case 'perfectTouch': return 'Perfect touches';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}
