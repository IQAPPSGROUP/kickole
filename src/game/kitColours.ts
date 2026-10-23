import type { ClothingColors } from './appearance';

/**
 * Data-driven kits. `pattern` picks the shirt mask. `plain` is a solid shirt.
 * `stripes` are vertical. Nation labels stay "Name colours".
 *
 * Colour values are on hold. Rob wants recognisable traditional football colours
 * rather than flag patterns (solid orange Netherlands, light blue Italy, blue
 * France). Replace `pattern` and the four colour fields when Graham's revised
 * sheet is approved. The hexes below are placeholders, not a final sheet.
 */
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'chevron' | 'sleeves';

export type KitKind = 'neutral' | 'nation';

export interface KitColour {
  id: string;
  /** Full name. Nation rows use "Name colours". Read out by the preview and the screen reader. */
  label: string;
  /** Short tile text. Omitted tiles show `label`. */
  tile?: string;
  kind: KitKind;
  pattern: KitPattern;
  shirt: string;
  secondary: string;
  shorts: string;
  socks: string;
}

/** Worn until the player picks something else. */
export const NEUTRAL_KIT_ID = 'neutral';

/** Legacy swatches that do not match a listed kit. Not shown in the picker. */
export const CUSTOM_KIT_ID = 'custom';

/** Every kit boot is this plain colour. */
export const KIT_BOOT = '#2B2B2B';

/** The yellow and navy kit from before this picker. Migrates to Neutral when no id was saved. */
export const HISTORICAL_KIT: ClothingColors = {
  shirt: '#FFD93D',
  shirtTrim: '#1E2A5A',
  shorts: '#1E2A5A',
  socks: '#F8F9FB',
};

const PATTERNS: readonly KitPattern[] = ['plain', 'stripes', 'hoops', 'halves', 'sash', 'chevron', 'sleeves'];

export function isKitPattern(value: string): value is KitPattern {
  return (PATTERNS as readonly string[]).includes(value);
}

function kit(
  id: string,
  label: string,
  kind: KitKind,
  pattern: KitPattern,
  shirt: string,
  secondary: string,
  shorts: string,
  socks: string,
  tile?: string,
): KitColour {
  return { id, label, tile, kind, pattern, shirt, secondary, shorts, socks };
}

export const KIT_COLOURS: readonly KitColour[] = [
  kit('neutral', 'Neutral', 'neutral', 'plain', '#E4E0D8', '#5C6570', '#3A4148', '#E4E0D8'),

  kit('england', 'England colours', 'nation', 'halves', '#FFFFFF', '#C8102E', '#C8102E', '#FFFFFF'),
  kit('scotland', 'Scotland colours', 'nation', 'hoops', '#0B2A5B', '#FFFFFF', '#FFFFFF', '#0B2A5B'),
  kit('wales', 'Wales colours', 'nation', 'halves', '#C8102E', '#00843D', '#FFFFFF', '#00843D'),
  kit('northern-ireland', 'Northern Ireland colours', 'nation', 'sash', '#FFFFFF', '#C8102E', '#FFFFFF', '#C8102E', 'N. Ireland'),
  kit('ireland', 'Ireland colours', 'nation', 'chevron', '#FFFFFF', '#169B62', '#FF883E', '#169B62'),
  kit('france', 'France colours', 'nation', 'sleeves', '#ED2939', '#002395', '#FFFFFF', '#002395'),
  kit('spain', 'Spain colours', 'nation', 'sash', '#F1BF00', '#AA151B', '#AA151B', '#F1BF00'),
  kit('portugal', 'Portugal colours', 'nation', 'hoops', '#006600', '#FF0000', '#006600', '#FF0000'),
  kit('germany', 'Germany colours', 'nation', 'chevron', '#FFCE00', '#000000', '#DD0000', '#000000'),
  kit('italy', 'Italy colours', 'nation', 'sleeves', '#009246', '#FFFFFF', '#CE2B37', '#009246'),
  kit('netherlands', 'Netherlands colours', 'nation', 'hoops', '#FF6F00', '#FFFFFF', '#21468B', '#FF6F00'),
  kit('brazil', 'Brazil colours', 'nation', 'halves', '#009C3B', '#FFDF00', '#002776', '#FFDF00'),
  kit('argentina', 'Argentina colours', 'nation', 'chevron', '#FFFFFF', '#74ACDF', '#74ACDF', '#FFFFFF'),
  kit('usa', 'USA colours', 'nation', 'sash', '#0A3161', '#B31942', '#FFFFFF', '#B31942'),
  kit('nigeria', 'Nigeria colours', 'nation', 'stripes', '#008751', '#FFFFFF', '#008751', '#FFFFFF'),
  kit('japan', 'Japan colours', 'nation', 'sleeves', '#BC002D', '#FFFFFF', '#FFFFFF', '#BC002D'),
  // Provisional solid yellow and blue so the 17th row can render. Not an approved hex.
  kit('sweden', 'Sweden colours', 'nation', 'plain', '#FECC02', '#006AA7', '#006AA7', '#FECC02'),
];

const BY_ID = new Map(KIT_COLOURS.map((option) => [option.id, option]));

export function getKitColour(id: string): KitColour | null {
  return BY_ID.get(id) ?? null;
}

export function kitTileLabel(option: KitColour): string {
  return option.tile ?? option.label;
}

/** Shirt, collar, shorts and socks from the sheet. The shirt pattern uses shirt and secondary. */
export function clothingFor(option: KitColour): ClothingColors {
  return {
    shirt: option.shirt,
    shirtTrim: option.secondary,
    shorts: option.shorts,
    socks: option.socks,
  };
}

export function clothingEquals(a: ClothingColors, b: ClothingColors): boolean {
  return a.shirt.toLowerCase() === b.shirt.toLowerCase()
    && a.shirtTrim.toLowerCase() === b.shirtTrim.toLowerCase()
    && a.shorts.toLowerCase() === b.shorts.toLowerCase()
    && a.socks.toLowerCase() === b.socks.toLowerCase();
}

export function matchKitColour(clothing: ClothingColors): KitColour | null {
  return KIT_COLOURS.find((option) => clothingEquals(clothingFor(option), clothing)) ?? null;
}

export function kitColoursInGroup(kind: KitKind): readonly KitColour[] {
  return KIT_COLOURS.filter((option) => option.kind === kind);
}
