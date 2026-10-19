/**
 * Free player customisation — skin tone, hair colour/style and basic clothing colours.
 * Shop kits/boots never overwrite these when equipped; composeAppearance merges them.
 */

/** Free body choice. Not a shop item. Existing saves migrate to male. */
export type PlayerBody = 'male' | 'female';

export type HairStyle =
  | 'short'
  | 'afro'
  | 'mohawk'
  | 'highTop'
  | 'curls'
  | 'braids'
  | 'spikes'
  | 'shaved'
  | 'bald';

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
  hairStyle: HairStyle;
  /** Free colour picks used when no purchasable kit is equipped. */
  clothing: ClothingColors;
}

export const HAIR_STYLES: readonly { id: HairStyle; label: string }[] = [
  { id: 'short', label: 'Short' },
  { id: 'afro', label: 'Afro' },
  { id: 'mohawk', label: 'Mohawk' },
  { id: 'highTop', label: 'High-top' },
  { id: 'curls', label: 'Short curls' },
  { id: 'braids', label: 'Braids' },
  { id: 'spikes', label: 'Spikes' },
  { id: 'shaved', label: 'Shaved' },
  { id: 'bald', label: 'Bald' },
];

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
  hairStyle: 'short',
  clothing: {
    shirt: '#FFD93D',
    shirtTrim: '#1E2A5A',
    shorts: '#1E2A5A',
    socks: '#F8F9FB',
  },
};

export function isHairStyle(id: string): id is HairStyle {
  return HAIR_STYLES.some((h) => h.id === id);
}

export function normalizeAppearance(raw: Partial<Appearance> | null | undefined): Appearance {
  const clothing = raw?.clothing;
  return {
    body: typeof raw?.body === 'string' && isPlayerBody(raw.body) ? raw.body : DEFAULT_APPEARANCE.body,
    skinTone: typeof raw?.skinTone === 'string' ? raw.skinTone : DEFAULT_APPEARANCE.skinTone,
    hairColor: typeof raw?.hairColor === 'string' ? raw.hairColor : DEFAULT_APPEARANCE.hairColor,
    hairStyle: typeof raw?.hairStyle === 'string' && isHairStyle(raw.hairStyle)
      ? raw.hairStyle
      : DEFAULT_APPEARANCE.hairStyle,
    clothing: {
      shirt: typeof clothing?.shirt === 'string' ? clothing.shirt : DEFAULT_APPEARANCE.clothing.shirt,
      shirtTrim: typeof clothing?.shirtTrim === 'string' ? clothing.shirtTrim : DEFAULT_APPEARANCE.clothing.shirtTrim,
      shorts: typeof clothing?.shorts === 'string' ? clothing.shorts : DEFAULT_APPEARANCE.clothing.shorts,
      socks: typeof clothing?.socks === 'string' ? clothing.socks : DEFAULT_APPEARANCE.clothing.socks,
    },
  };
}
