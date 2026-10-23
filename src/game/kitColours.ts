import type { ClothingColors } from './appearance';
import nationalKitSpec from '../../docs/design-refs/national-kits/spec.json';

/**
 * National kits. Graham edits `docs/design-refs/national-kits/spec.json`.
 * A shirt is the colour fans recognise. Vertical stripes are only for an iconic
 * striped shirt. Trim bands are flag colours on the collar, cuffs and sock tops.
 * Labels stay "Name colours". Boots are the plain dark pair, not a brand mark.
 */
export type KitPattern = 'plain' | 'stripes';

export type KitKind = 'neutral' | 'nation';

export type KitRegion = 'Europe' | 'Africa' | 'Asia' | 'Americas' | 'Oceania';

export type KitTab = 'popular' | KitRegion;

export const KIT_REGIONS: readonly KitRegion[] = ['Europe', 'Africa', 'Asia', 'Americas', 'Oceania'];

export interface KitColour {
  id: string;
  /** Full name. Nation rows use "Name colours". Read out by the preview and the screen reader. */
  label: string;
  /** Short tile text. Omitted tiles show `label`. */
  tile?: string;
  kind: KitKind;
  region: KitRegion | null;
  pattern: KitPattern;
  shirt: string;
  /** Second shirt colour. Stripes use it. A plain shirt keeps the main colour. */
  secondary: string;
  shorts: string;
  socks: string;
  /** Flag-colour bands, collar at the first colour through to the cuff edge. */
  trimBands: readonly string[];
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

/** Rob's approved seventeen, in picker order. */
export const POPULAR_KIT_IDS = [
  'england',
  'scotland',
  'wales',
  'northern-ireland',
  'ireland',
  'france',
  'spain',
  'portugal',
  'germany',
  'italy',
  'netherlands',
  'sweden',
  'brazil',
  'argentina',
  'usa',
  'nigeria',
  'japan',
] as const;

const REGIONS: readonly KitRegion[] = KIT_REGIONS;

function isRegion(value: string): value is KitRegion {
  return (REGIONS as readonly string[]).includes(value);
}

function slug(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

interface SpecRow {
  name: string;
  label: string;
  tileLabel: string;
  region: string;
  pattern: string;
  shirt: string;
  patternSecondary: string | null;
  shorts: string;
  socks: string;
  trimBands: string[];
  boots: string;
}

function specPattern(value: string): KitPattern {
  switch (value) {
    case 'solid':
      return 'plain';
    case 'stripes':
      return 'stripes';
    default:
      throw new Error(`Unknown kit pattern ${value}`);
  }
}

function nationFromSpec(row: SpecRow): KitColour {
  if (!isRegion(row.region)) throw new Error(`Unknown kit region ${row.region}`);
  if (!row.label.endsWith(' colours')) throw new Error(`Kit label must end with colours: ${row.label}`);
  if (row.boots.toUpperCase() !== KIT_BOOT) throw new Error(`Kit boots must be ${KIT_BOOT}: ${row.name}`);
  if (row.trimBands.length < 2) throw new Error(`Kit needs trim bands: ${row.name}`);
  const pattern = specPattern(row.pattern);
  return {
    id: slug(row.name),
    label: row.label,
    tile: row.tileLabel,
    kind: 'nation',
    region: row.region,
    pattern,
    shirt: row.shirt,
    secondary: pattern === 'stripes' && row.patternSecondary ? row.patternSecondary : row.shirt,
    shorts: row.shorts,
    socks: row.socks,
    trimBands: row.trimBands,
  };
}

const NEUTRAL: KitColour = {
  id: NEUTRAL_KIT_ID,
  label: 'Neutral',
  kind: 'neutral',
  region: null,
  pattern: 'plain',
  shirt: '#E4E0D8',
  secondary: '#E4E0D8',
  shorts: '#3A4148',
  socks: '#E4E0D8',
  trimBands: ['#5C6570', '#3A4148'],
};

export const KIT_COLOURS: readonly KitColour[] = [
  NEUTRAL,
  ...(nationalKitSpec as SpecRow[]).map(nationFromSpec),
];

const BY_ID = new Map(KIT_COLOURS.map((option) => [option.id, option]));

export function getKitColour(id: string): KitColour | null {
  return BY_ID.get(id) ?? null;
}

export function kitTileLabel(option: KitColour): string {
  return option.tile ?? option.label;
}

/** Shirt, collar, shorts and socks. The collar fallback is the first trim band. */
export function clothingFor(option: KitColour): ClothingColors {
  return {
    shirt: option.shirt,
    shirtTrim: option.trimBands[0] ?? option.shirt,
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

export function popularKits(): readonly KitColour[] {
  const neutral = getKitColour(NEUTRAL_KIT_ID);
  const nations = POPULAR_KIT_IDS.map((id) => getKitColour(id));
  if (!neutral || nations.some((option) => option == null)) {
    throw new Error('Popular kits are missing from the sheet');
  }
  return [neutral, ...nations.filter((option): option is KitColour => option != null)];
}

/** Empty search uses the tab. A query searches every kit, including Neutral. */
export function filterKits(tab: KitTab, query: string): readonly KitColour[] {
  const text = query.trim().toLowerCase();
  if (text) {
    return KIT_COLOURS.filter((option) => option.label.toLowerCase().includes(text)
      || kitTileLabel(option).toLowerCase().includes(text));
  }
  switch (tab) {
    case 'popular':
      return popularKits();
    case 'Europe':
    case 'Africa':
    case 'Asia':
    case 'Americas':
    case 'Oceania':
      return KIT_COLOURS
        .filter((option) => option.region === tab)
        .slice()
        .sort((a, b) => kitTileLabel(a).localeCompare(kitTileLabel(b), 'en'));
    default: {
      const neverTab: never = tab;
      return neverTab;
    }
  }
}
