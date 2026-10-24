/**
 * Kickolé wardrobe catalogue — cosmetic boots and kits.
 * Nothing in this list is sold. National kit colours are free and live in kitColours.ts.
 * Boots never alter timing windows or scoring.
 */

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
  id: string;
  name: string;
  theme: DesignTheme;
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

export const STARTER_BOOT_ID = 'boot-street-classic';
export const STARTER_KIT_ID = 'kit-street-classic';

export const BOOTS: readonly BootDesign[] = [
  {
    id: STARTER_BOOT_ID,
    name: 'Street Classic',
    theme: 'Street Classic',
    unlock: { tier: 'starter', challenge: 'none', challengeTarget: 0 },
    main: '#FF4F9A',
    sole: '#222831',
    lace: '#F8F9FB',
    trim: '#1E2A5A',
    pattern: 'panels',
    note: 'Starter pair. Included from the first run.',
  },
  {
    id: 'boot-beach-wave',
    name: 'Beach Wave',
    theme: 'Beach Wave',
    unlock: UNLOCK_TIERS.club,
    main: '#3D7EA6',
    sole: '#F5E6C8',
    lace: '#F7F5ED',
    trim: '#12BFA6',
    pattern: 'wave',
    note: 'Coastal panels and foam sole.',
  },
  {
    id: 'boot-carnival',
    name: 'Carnival Flex',
    theme: 'Carnival',
    unlock: UNLOCK_TIERS.club,
    main: '#FF805D',
    sole: '#F7F5ED',
    lace: '#EAF44A',
    trim: '#9B59B6',
    pattern: 'carnival',
    note: 'Festival panels with neon trim.',
  },
  {
    id: 'boot-midnight',
    name: 'Midnight Grip',
    theme: 'Midnight',
    unlock: UNLOCK_TIERS.street,
    main: '#1A1A2E',
    sole: '#12BFA6',
    lace: '#F7F5ED',
    trim: '#3D7EA6',
    pattern: 'midnight',
    note: 'Dark leather with teal sole stripe.',
  },
  {
    id: 'boot-mosaic',
    name: 'Mosaic Tile',
    theme: 'Mosaic',
    unlock: UNLOCK_TIERS.street,
    main: '#F5C94D',
    sole: '#142D35',
    lace: '#FF805D',
    trim: '#12BFA6',
    pattern: 'mosaic',
    note: 'Tile-break panels across the vamp.',
  },
  {
    id: 'boot-street-runner',
    name: 'Street Runner',
    theme: 'Street Classic',
    unlock: UNLOCK_TIERS.freestyle,
    main: '#F7F5ED',
    sole: '#FF805D',
    lace: '#142D35',
    trim: '#EAF44A',
    pattern: 'stripe',
    note: 'Court stripes and high-contrast sole.',
  },
  {
    id: 'boot-gold',
    name: 'Gold Touch',
    theme: 'Gold',
    unlock: UNLOCK_TIERS.freestyle,
    main: '#F5C94D',
    sole: '#8B6914',
    lace: '#F7F5ED',
    trim: '#EAF44A',
    pattern: 'gold',
    note: 'Metallic finish with gold trim.',
  },
  {
    id: 'boot-legend-spike',
    name: 'Legend Spike',
    theme: 'Gold',
    unlock: UNLOCK_TIERS.legend,
    main: '#142D35',
    sole: '#F5C94D',
    lace: '#EAF44A',
    trim: '#FF805D',
    pattern: 'gold',
    note: 'Top-tier launch silhouette.',
  },
  {
    id: 'boot-cowboy',
    name: 'Cowboy Boots',
    theme: 'Cowboy',
    unlock: { tier: 'starter', challenge: 'none', challengeTarget: 0 },
    main: '#8A5A32',
    sole: '#4A3424',
    lace: '#E7D3A1',
    trim: '#C4A574',
    pattern: 'cowboy',
    note: 'Tan leather, stitching, a pointed toe and a block heel.',
  },
];

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
