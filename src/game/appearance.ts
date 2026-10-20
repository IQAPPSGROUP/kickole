/**
 * Free player customisation — skin tone, hair colour and basic clothing colours.
 * Shop kits/boots never overwrite these when equipped; composeAppearance merges them.
 * Saved hairstyle ids from older builds are ignored; the purchased model hair is the only silhouette.
 */

/** Free body choice. Not a shop item. Existing saves migrate to male. */
export type PlayerBody = 'male' | 'female';

export interface ClothingColors {
  shirt: string;
  shirtTrim: string;
  shorts: string;
  socks: string;
}

export interface Appearance {
  /** Male or female footballer. Both looks are free. */
  body: PlayerBody;
  skinTone: string;
  hairColor: string;
  /** Free colour picks used when no purchasable kit is equipped. */
  clothing: ClothingColors;
}

export const SKIN_TONES: readonly string[] = [
  '#F2CDAA', '#E8B48F', '#D4A574', '#C68642', '#8D5A3C', '#5C3A2A', '#3B2418',
];

export const HAIR_COLORS: readonly string[] = [
  '#16100E', '#2A1E1A', '#4A3428', '#C9822B', '#8B5A2B', '#F5E6C8', '#1A1A2E', '#6B2D5C',
];

export const CLOTHING_SWATCHES: readonly string[] = [
  '#FFD93D', '#1E2A5A', '#FF4F9A', '#00B8A9', '#FF8A5B', '#6C5CE7', '#F8F9FB', '#222831',
];

export function isPlayerBody(id: string): id is PlayerBody {
  return id === 'male' || id === 'female';
}

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'male',
  skinTone: '#E8B48F',
  hairColor: '#2A1E1A',
  clothing: {
    shirt: '#FFD93D',
    shirtTrim: '#1E2A5A',
    shorts: '#1E2A5A',
    socks: '#F8F9FB',
  },
};

export function normalizeAppearance(raw: Partial<Appearance> | null | undefined): Appearance {
  const clothing = raw?.clothing;
  // Older saves stored hairStyle (afro, braids, bald, …). Rebuild the object so that field is dropped.
  return {
    body: typeof raw?.body === 'string' && isPlayerBody(raw.body) ? raw.body : DEFAULT_APPEARANCE.body,
    skinTone: typeof raw?.skinTone === 'string' ? raw.skinTone : DEFAULT_APPEARANCE.skinTone,
    hairColor: typeof raw?.hairColor === 'string' ? raw.hairColor : DEFAULT_APPEARANCE.hairColor,
    clothing: {
      shirt: typeof clothing?.shirt === 'string' ? clothing.shirt : DEFAULT_APPEARANCE.clothing.shirt,
      shirtTrim: typeof clothing?.shirtTrim === 'string' ? clothing.shirtTrim : DEFAULT_APPEARANCE.clothing.shirtTrim,
      shorts: typeof clothing?.shorts === 'string' ? clothing.shorts : DEFAULT_APPEARANCE.clothing.shorts,
      socks: typeof clothing?.socks === 'string' ? clothing.socks : DEFAULT_APPEARANCE.clothing.socks,
    },
  };
}
