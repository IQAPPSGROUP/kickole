/**
 * Free player customisation — skin tone, hair colour and kit colours.
 * Shop kits/boots never overwrite these when equipped; composeAppearance merges them.
 * Saved hairstyle ids from older builds are ignored; the purchased model hair is the only silhouette.
 */
import {
  CUSTOM_KIT_ID,
  HISTORICAL_KIT,
  NEUTRAL_KIT_ID,
  clothingEquals,
  clothingFor,
  getKitColour,
  matchKitColour,
} from './kitColours';

/** Body choice. Not a shop item. The body choice is selectable. Existing saves migrate to male. */
export type PlayerBody = 'male' | 'female';

export interface ClothingColors {
  shirt: string;
  shirtTrim: string;
  shorts: string;
  socks: string;
}

export interface Appearance {
  /** Male or female footballer. The body choice is selectable. */
  body: PlayerBody;
  skinTone: string;
  hairColor: string;
  /** Free kit-colour id. `custom` keeps clothing that is not in the list. */
  kitColourId: string;
  /** Shirt, trim, shorts and socks. A listed kit colour overwrites these. */
  clothing: ClothingColors;
}

export const SKIN_TONES: readonly string[] = [
  '#F2CDAA', '#E8B48F', '#D4A574', '#C68642', '#8D5A3C', '#5C3A2A', '#3B2418',
];

export const HAIR_COLORS: readonly string[] = [
  '#16100E', '#2A1E1A', '#4A3428', '#C9822B', '#8B5A2B', '#F5E6C8', '#1A1A2E', '#6B2D5C',
];

export function isPlayerBody(id: string): id is PlayerBody {
  return id === 'male' || id === 'female';
}

export const DEFAULT_APPEARANCE: Appearance = {
  body: 'male',
  skinTone: '#E8B48F',
  hairColor: '#2A1E1A',
  kitColourId: NEUTRAL_KIT_ID,
  clothing: clothingFor(getKitColour(NEUTRAL_KIT_ID)!),
};

function filledClothing(raw: Partial<ClothingColors> | undefined): ClothingColors {
  const fallback = DEFAULT_APPEARANCE.clothing;
  return {
    shirt: typeof raw?.shirt === 'string' ? raw.shirt : fallback.shirt,
    shirtTrim: typeof raw?.shirtTrim === 'string' ? raw.shirtTrim : fallback.shirtTrim,
    shorts: typeof raw?.shorts === 'string' ? raw.shorts : fallback.shorts,
    socks: typeof raw?.socks === 'string' ? raw.socks : fallback.socks,
  };
}

function hasClothing(raw: Partial<ClothingColors> | undefined): boolean {
  return typeof raw?.shirt === 'string'
    || typeof raw?.shirtTrim === 'string'
    || typeof raw?.shorts === 'string'
    || typeof raw?.socks === 'string';
}

export function normalizeAppearance(raw: Partial<Appearance> | null | undefined): Appearance {
  // Older saves stored hairStyle (afro, braids, bald, …). Rebuild the object so that field is dropped.
  const body = typeof raw?.body === 'string' && isPlayerBody(raw.body) ? raw.body : DEFAULT_APPEARANCE.body;
  const skinTone = typeof raw?.skinTone === 'string' ? raw.skinTone : DEFAULT_APPEARANCE.skinTone;
  const hairColor = typeof raw?.hairColor === 'string' ? raw.hairColor : DEFAULT_APPEARANCE.hairColor;
  const base = { body, skinTone, hairColor };
  const requested = typeof raw?.kitColourId === 'string' ? raw.kitColourId : '';
  const preset = getKitColour(requested);
  if (preset) {
    return { ...base, kitColourId: preset.id, clothing: clothingFor(preset) };
  }
  if (!hasClothing(raw?.clothing)) {
    return { ...base, kitColourId: NEUTRAL_KIT_ID, clothing: { ...DEFAULT_APPEARANCE.clothing } };
  }
  const clothing = filledClothing(raw?.clothing);
  if (requested === CUSTOM_KIT_ID) {
    return { ...base, kitColourId: CUSTOM_KIT_ID, clothing };
  }
  if (clothingEquals(clothing, HISTORICAL_KIT)) {
    return { ...base, kitColourId: NEUTRAL_KIT_ID, clothing: { ...DEFAULT_APPEARANCE.clothing } };
  }
  const matched = matchKitColour(clothing);
  if (matched) return { ...base, kitColourId: matched.id, clothing: clothingFor(matched) };
  return { ...base, kitColourId: CUSTOM_KIT_ID, clothing };
}
