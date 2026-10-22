import type { EntitlementSource, StoreProduct } from '../billing/types';
import type { ClothingColors, PlayerBody } from './appearance';

/**
 * Themed cosmetics. They never change kick timing or scoring.
 * Prices come only from a store product's priceString. These IDs are not part
 * of LAUNCH_COLLECTION_ITEM_IDS, and simPurchase / dev_sim never grants them.
 * Gold Legend is a streak reward, not a product.
 */

export const OUTFIT_IDS = [
  'alien',
  'spaceman',
  'street-hero',
  'night-glider',
  'stripe-bandit',
  'night-wrap',
  'deck-hand',
  'grey-ghoul',
  'keep-guard',
  'kitchen-whites',
  'spike-hood',
  'stage-jacket',
  'ring-mask',
  'match-official',
  'seventies',
  'north-pole',
  'snow-friend',
  'gold-legend',
] as const;

export type OutfitId = (typeof OUTFIT_IDS)[number];

export const COWBOY_BOOT_ID = 'boot-cowboy';
export const COWBOY_PRODUCT_ID = 'kickole_boot_cowboy';

/** Lifetime best combo required. Not a purchase. */
export const GOLD_LEGEND_STREAK = 50;

export type OutfitPattern = 'weave' | 'stripes' | 'chain' | 'torn' | 'gold' | 'leather' | 'snow' | 'night';

export interface OutfitDesign {
  id: OutfitId;
  name: string;
  /** Null for the streak reward. Never a made-up price. */
  productId: string | null;
  clothing: ClothingColors;
  pattern: OutfitPattern;
  /** Pale costume tint on the skin map. Null keeps the footballer's own skin. */
  skinTint: string | null;
  note: string;
}

const cloth = (shirt: string, shirtTrim: string, shorts: string, socks: string): ClothingColors => ({
  shirt, shirtTrim, shorts, socks,
});

export const OUTFITS: readonly OutfitDesign[] = [
  {
    id: 'alien',
    name: 'Alien',
    productId: 'kickole_outfit_alien',
    clothing: cloth('#6FBF8A', '#1F6B45', '#2F8F5B', '#D5E8D4'),
    pattern: 'weave',
    skinTint: null,
    note: 'Green skin-tone suit and an antenna headband. The face stays the footballer.',
  },
  {
    id: 'spaceman',
    name: 'Spaceman',
    productId: 'kickole_outfit_spaceman',
    clothing: cloth('#F4F7F8', '#C5D0D6', '#E7EEF2', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'White suit, visor flipped up, and a backpack.',
  },
  {
    id: 'street-hero',
    name: 'Street Hero',
    productId: 'kickole_outfit_street_hero',
    clothing: cloth('#2F6FED', '#F4C430', '#1B2A4A', '#F4C430'),
    pattern: 'weave',
    skinTint: null,
    note: 'Original cape and a round ball badge. No borrowed hero marks.',
  },
  {
    id: 'night-glider',
    name: 'Night Glider',
    productId: 'kickole_outfit_night_glider',
    clothing: cloth('#2A2E33', '#8B939C', '#1A1D21', '#3A3F45'),
    pattern: 'night',
    skinTint: null,
    note: 'Dark cape and a plain wing chevron. No cowl and no bat emblem.',
  },
  {
    id: 'stripe-bandit',
    name: 'Stripe Bandit',
    productId: 'kickole_outfit_stripe_bandit',
    clothing: cloth('#F7F5ED', '#1A1A1A', '#22262C', '#F7F5ED'),
    pattern: 'stripes',
    skinTint: null,
    note: 'Striped top, domino mask, beanie, and a small swag sack.',
  },
  {
    id: 'night-wrap',
    name: 'Ninja Wrap',
    productId: 'kickole_outfit_night_wrap',
    clothing: cloth('#1C1C1C', '#C0392B', '#111111', '#2A2A2A'),
    pattern: 'night',
    skinTint: null,
    note: 'Black wrap, headband, and forearm tape.',
  },
  {
    id: 'deck-hand',
    name: 'Deck Hand',
    productId: 'kickole_outfit_deck_hand',
    clothing: cloth('#F4F1EA', '#6B1D1D', '#1E3A5F', '#F4F1EA'),
    pattern: 'stripes',
    skinTint: null,
    note: 'Striped shirt, waistcoat, bandana, and an eyepatch.',
  },
  {
    id: 'grey-ghoul',
    name: 'Grey Ghoul',
    productId: 'kickole_outfit_grey_ghoul',
    clothing: cloth('#8E9089', '#5C5E58', '#6A6C66', '#B7B8B2'),
    pattern: 'torn',
    skinTint: '#C5C6C0',
    note: 'Pale grey costume and cloth bandages. No blood or wounds.',
  },
  {
    id: 'keep-guard',
    name: 'Keep Guard',
    productId: 'kickole_outfit_keep_guard',
    clothing: cloth('#C0C4C8', '#7A1F2B', '#4A4E55', '#D9DDE2'),
    pattern: 'chain',
    skinTint: null,
    note: 'Chainmail-look top and a tabard with an original crest.',
  },
  {
    id: 'kitchen-whites',
    name: 'Kitchen Whites',
    productId: 'kickole_outfit_kitchen_whites',
    clothing: cloth('#F7F5ED', '#E7E2D6', '#F4F1EA', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Whites, a full apron, and a tall hat.',
  },
  {
    id: 'spike-hood',
    name: 'Spike Hood',
    productId: 'kickole_outfit_spike_hood',
    clothing: cloth('#3E7D4F', '#E7A317', '#2C5A38', '#6FA37A'),
    pattern: 'weave',
    skinTint: null,
    note: 'Dino onesie hood with three spikes. The face stays open.',
  },
  {
    id: 'stage-jacket',
    name: 'Stage Jacket',
    productId: 'kickole_outfit_stage_jacket',
    clothing: cloth('#2B241C', '#C4A574', '#1A1612', '#3A3128'),
    pattern: 'leather',
    skinTint: null,
    note: 'Leather jacket, small shades, and a quiff.',
  },
  {
    id: 'ring-mask',
    name: 'Ring Mask',
    productId: 'kickole_outfit_ring_mask',
    clothing: cloth('#E23B4A', '#F2C14E', '#1F6B8A', '#F2C14E'),
    pattern: 'weave',
    skinTint: null,
    note: 'Bright original wrestling mask and a short cape.',
  },
  {
    id: 'match-official',
    name: 'Match Official',
    productId: 'kickole_outfit_match_official',
    clothing: cloth('#1A1A1A', '#F7F5ED', '#141414', '#1A1A1A'),
    pattern: 'night',
    skinTint: null,
    note: 'All black, a whistle, and cards in a pocket.',
  },
  {
    id: 'seventies',
    name: 'Seventies',
    productId: 'kickole_outfit_seventies',
    clothing: cloth('#E07A3D', '#F4F1EA', '#F2C14E', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Sweatband and a small costume moustache. Shorts stay the footballer cut.',
  },
  {
    id: 'north-pole',
    name: 'North Pole',
    productId: 'kickole_outfit_north_pole',
    clothing: cloth('#B4232A', '#F4F1EA', '#8E1C22', '#F7F5ED'),
    pattern: 'weave',
    skinTint: null,
    note: 'Red suit, hat, and a short beard that leaves the eyes clear.',
  },
  {
    id: 'snow-friend',
    name: 'Snow Friend',
    productId: 'kickole_outfit_snow_friend',
    clothing: cloth('#F7FBFF', '#E24B4B', '#F4F7FA', '#F7FBFF'),
    pattern: 'snow',
    skinTint: null,
    note: 'White kit, scarf, buttons, and a carrot nose. Same covered kit on every body.',
  },
  {
    id: 'gold-legend',
    name: 'Gold Legend',
    productId: null,
    clothing: cloth('#E3B341', '#8A6A1F', '#C4922A', '#F0D78C'),
    pattern: 'gold',
    skinTint: null,
    note: `Shiny gold kit. Unlocks at a ${GOLD_LEGEND_STREAK} combo, not from the store.`,
  },
];

export function isOutfitId(id: string): id is OutfitId {
  return (OUTFIT_IDS as readonly string[]).includes(id);
}

export function getOutfit(id: string | null | undefined): OutfitDesign | null {
  if (!id || !isOutfitId(id)) return null;
  return OUTFITS.find((outfit) => outfit.id === id) ?? null;
}

export function outfitProductId(id: string): string | null {
  return getOutfit(id)?.productId ?? (id === COWBOY_BOOT_ID ? COWBOY_PRODUCT_ID : null);
}

/**
 * Localised store price, or null when this cosmetic is not sold or the store
 * has not returned a priceString. Callers must not invent a number.
 */
export function cosmeticPriceString(
  productId: string | null,
  products: readonly Pick<StoreProduct, 'productId' | 'priceString'>[],
): string | null {
  if (!productId) return null;
  const price = products.find((product) => product.productId === productId)?.priceString;
  if (typeof price !== 'string' || price.trim().length === 0) return null;
  return price;
}

export function goldLegendUnlocked(bestStreak: number): boolean {
  return Number.isFinite(bestStreak) && bestStreak >= GOLD_LEGEND_STREAK;
}

/**
 * Store grants are apple/google only.
 * dev_sim is refused in every build so ?simPurchase=1 cannot unlock a themed look.
 */
export function cosmeticGrantAllowed(source: EntitlementSource): boolean {
  return source === 'apple' || source === 'google';
}

/**
 * Whether a saved store-cosmetic list may be trusted.
 * Production web drops a hand-edited list. Development may keep a source-none
 * list so a local preview can dress the model. dev_sim is never trusted.
 */
export function keepStoreCosmetic(
  source: EntitlementSource,
  trustStoreCache: boolean,
  prod: boolean,
): boolean {
  if (source === 'dev_sim') return false;
  if (source === 'apple' || source === 'google') return trustStoreCache;
  return !prod;
}

/** Both bodies wear the same full kit. Accessories are fitted separately. */
export function outfitCoversBody(outfit: OutfitDesign): boolean {
  const { shirt, shorts, socks } = outfit.clothing;
  return Boolean(shirt && shorts && socks);
}

export function outfitsForBody(_body: PlayerBody): readonly OutfitDesign[] {
  return OUTFITS;
}
