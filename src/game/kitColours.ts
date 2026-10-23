import type { ClothingColors } from './appearance';

/**
 * Free kits. Graham can replace `pattern` and `colours` without touching the picker.
 * Nation labels stay "Name colours". These are flag colours in simple original
 * patterns, not federation kits: no crests, badges, flags, sponsors or brand marks.
 */
export type KitPattern = 'plain' | 'stripes' | 'hoops' | 'halves' | 'sash';

export type KitKind = 'neutral' | 'nation';

export interface KitColour {
  id: string;
  /** Player-facing name. Nation rows use "Name colours". Never "official". */
  label: string;
  kind: KitKind;
  pattern: KitPattern;
  /** Flag colours, first to last. */
  colours: readonly string[];
}

/** Worn until the player picks something else. */
export const NEUTRAL_KIT_ID = 'neutral';

/** Legacy swatches that do not match a listed kit. Not shown in the picker. */
export const CUSTOM_KIT_ID = 'custom';

/** The yellow and navy kit from before this picker. Migrates to Neutral when no id was saved. */
export const HISTORICAL_KIT: ClothingColors = {
  shirt: '#FFD93D',
  shirtTrim: '#1E2A5A',
  shorts: '#1E2A5A',
  socks: '#F8F9FB',
};

const PATTERNS: readonly KitPattern[] = ['plain', 'stripes', 'hoops', 'halves', 'sash'];

export function isKitPattern(value: string): value is KitPattern {
  return (PATTERNS as readonly string[]).includes(value);
}

function kit(
  id: string,
  label: string,
  kind: KitKind,
  pattern: KitPattern,
  colours: readonly string[],
): KitColour {
  return { id, label, kind, pattern, colours };
}

export const KIT_COLOURS: readonly KitColour[] = [
  kit('neutral', 'Neutral', 'neutral', 'plain', ['#E4E0D8', '#5C6570', '#3A4148']),
  kit('classic', 'Classic colours', 'neutral', 'plain', ['#FFD93D', '#1E2A5A', '#1E2A5A', '#F8F9FB']),
  kit('night', 'Night colours', 'neutral', 'plain', ['#1C2430', '#12BFA6', '#141A22']),
  kit('street', 'Street colours', 'neutral', 'plain', ['#12BFA6', '#F7F5ED', '#142D35', '#12BFA6']),

  kit('england', 'England colours', 'nation', 'hoops', ['#FFFFFF', '#CF081F']),
  kit('scotland', 'Scotland colours', 'nation', 'plain', ['#0065BF', '#FFFFFF']),
  kit('wales', 'Wales colours', 'nation', 'halves', ['#C8102E', '#FFFFFF', '#00AB39']),
  kit('ireland', 'Ireland colours', 'nation', 'stripes', ['#169B62', '#FFFFFF', '#FF883E']),
  kit('france', 'France colours', 'nation', 'stripes', ['#0055A4', '#FFFFFF', '#EF4135']),
  kit('germany', 'Germany colours', 'nation', 'hoops', ['#1A1A1A', '#DD0000', '#FFCE00']),
  kit('spain', 'Spain colours', 'nation', 'hoops', ['#AA151B', '#F1BF00']),
  kit('italy', 'Italy colours', 'nation', 'stripes', ['#009246', '#FFFFFF', '#CE2B37']),
  kit('netherlands', 'Netherlands colours', 'nation', 'sash', ['#FF6600', '#FFFFFF', '#21468B']),
  kit('brazil', 'Brazil colours', 'nation', 'sash', ['#009739', '#FEDD00', '#002776']),
  kit('argentina', 'Argentina colours', 'nation', 'hoops', ['#74ACDF', '#FFFFFF']),
  kit('mexico', 'Mexico colours', 'nation', 'stripes', ['#006847', '#FFFFFF', '#CE1126']),
  kit('japan', 'Japan colours', 'nation', 'plain', ['#FFFFFF', '#BC002D']),
  kit('nigeria', 'Nigeria colours', 'nation', 'stripes', ['#008751', '#FFFFFF']),
  kit('australia', 'Australia colours', 'nation', 'sash', ['#00843D', '#FFCD00']),
  kit('united-states', 'United States colours', 'nation', 'stripes', ['#002868', '#FFFFFF', '#BF0A30']),
];

const BY_ID = new Map(KIT_COLOURS.map((option) => [option.id, option]));

export function getKitColour(id: string): KitColour | null {
  return BY_ID.get(id) ?? null;
}

/** Solid shirt, collar, shorts and socks derived from the sheet. Patterned shirts still use these as the base. */
export function clothingFor(option: KitColour): ClothingColors {
  const shirt = option.colours[0] ?? '#E4E0D8';
  const second = option.colours[1] ?? shirt;
  const third = option.colours[2] ?? second;
  const socks = option.colours[3] ?? (option.colours.length > 2 ? shirt : second);
  return { shirt, shirtTrim: second, shorts: third, socks };
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
