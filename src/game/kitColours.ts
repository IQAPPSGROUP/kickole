import type { ClothingColors } from './appearance';

/**
 * Free kit colours. Each option tints the existing shirt, collar, shorts and socks
 * in solid blocks. National entries use that country's widely known colours.
 * They are not federation kits: no crests, badges, flags, hoops, sponsors or brand marks.
 */
export type KitColourGroup = 'neutral' | 'country';

export interface KitColour {
  id: string;
  name: string;
  group: KitColourGroup;
  clothing: ClothingColors;
}

/** Worn until the player picks something else. */
export const NEUTRAL_KIT_ID = 'neutral';

/** Legacy swatches that do not match a listed option. Not shown in the picker. */
export const CUSTOM_KIT_ID = 'custom';

/** The yellow and navy kit from before this picker. Migrates to Neutral when no id was saved. */
export const HISTORICAL_KIT: ClothingColors = {
  shirt: '#FFD93D',
  shirtTrim: '#1E2A5A',
  shorts: '#1E2A5A',
  socks: '#F8F9FB',
};

function kit(
  id: string,
  name: string,
  group: KitColourGroup,
  shirt: string,
  shirtTrim: string,
  shorts: string,
  socks: string,
): KitColour {
  return { id, name, group, clothing: { shirt, shirtTrim, shorts, socks } };
}

export const KIT_COLOURS: readonly KitColour[] = [
  kit('neutral', 'Neutral', 'neutral', '#E4E0D8', '#5C6570', '#3A4148', '#E4E0D8'),
  kit('classic', 'Classic', 'neutral', '#FFD93D', '#1E2A5A', '#1E2A5A', '#F8F9FB'),
  kit('night', 'Night', 'neutral', '#1C2430', '#12BFA6', '#141A22', '#1C2430'),
  kit('street', 'Street', 'neutral', '#12BFA6', '#F7F5ED', '#142D35', '#12BFA6'),

  kit('algeria', 'Algeria', 'country', '#006233', '#FFFFFF', '#FFFFFF', '#D21034'),
  kit('argentina', 'Argentina', 'country', '#74ACDF', '#FFFFFF', '#FFFFFF', '#74ACDF'),
  kit('australia', 'Australia', 'country', '#00843D', '#FFCD00', '#FFCD00', '#00843D'),
  kit('austria', 'Austria', 'country', '#ED2939', '#FFFFFF', '#FFFFFF', '#ED2939'),
  kit('belgium', 'Belgium', 'country', '#2D2926', '#FDDA24', '#EF3340', '#FDDA24'),
  kit('brazil', 'Brazil', 'country', '#009739', '#FEDD00', '#002776', '#FEDD00'),
  kit('cameroon', 'Cameroon', 'country', '#007A5E', '#FCD116', '#CE1126', '#FCD116'),
  kit('canada', 'Canada', 'country', '#C8102E', '#FFFFFF', '#FFFFFF', '#C8102E'),
  kit('chile', 'Chile', 'country', '#FFFFFF', '#0039A6', '#D52B1E', '#0039A6'),
  kit('china', 'China', 'country', '#DE2910', '#FFDE00', '#DE2910', '#FFDE00'),
  kit('colombia', 'Colombia', 'country', '#FCD116', '#003893', '#003893', '#CE1126'),
  kit('costa-rica', 'Costa Rica', 'country', '#002B7F', '#FFFFFF', '#CE1126', '#FFFFFF'),
  kit('croatia', 'Croatia', 'country', '#FF0000', '#FFFFFF', '#171796', '#FFFFFF'),
  kit('czechia', 'Czechia', 'country', '#D7141A', '#FFFFFF', '#11457E', '#FFFFFF'),
  kit('denmark', 'Denmark', 'country', '#C60C30', '#FFFFFF', '#FFFFFF', '#C60C30'),
  kit('egypt', 'Egypt', 'country', '#CE1126', '#FFFFFF', '#111111', '#FFFFFF'),
  kit('england', 'England', 'country', '#1B2838', '#FFFFFF', '#FFFFFF', '#CF081F'),
  kit('france', 'France', 'country', '#0055A4', '#FFFFFF', '#EF4135', '#FFFFFF'),
  kit('germany', 'Germany', 'country', '#1A1A1A', '#FFCE00', '#DD0000', '#FFCE00'),
  kit('ghana', 'Ghana', 'country', '#FCD116', '#006B3F', '#CE1126', '#006B3F'),
  kit('greece', 'Greece', 'country', '#0D5EAF', '#FFFFFF', '#FFFFFF', '#0D5EAF'),
  kit('india', 'India', 'country', '#FF9933', '#FFFFFF', '#138808', '#FFFFFF'),
  kit('iran', 'Iran', 'country', '#239F40', '#FFFFFF', '#DA0000', '#FFFFFF'),
  kit('ireland', 'Ireland', 'country', '#169B62', '#FFFFFF', '#FFFFFF', '#FF883E'),
  kit('italy', 'Italy', 'country', '#FFFFFF', '#009246', '#CE2B37', '#009246'),
  kit('jamaica', 'Jamaica', 'country', '#009B3A', '#FED100', '#111111', '#FED100'),
  kit('japan', 'Japan', 'country', '#FFFFFF', '#BC002D', '#BC002D', '#BC002D'),
  kit('kenya', 'Kenya', 'country', '#111111', '#BB0000', '#006600', '#BB0000'),
  kit('mexico', 'Mexico', 'country', '#006847', '#FFFFFF', '#CE1126', '#FFFFFF'),
  kit('morocco', 'Morocco', 'country', '#C1272D', '#006233', '#006233', '#C1272D'),
  kit('netherlands', 'Netherlands', 'country', '#FF6600', '#FFFFFF', '#21468B', '#FFFFFF'),
  kit('new-zealand', 'New Zealand', 'country', '#1A1A1A', '#FFFFFF', '#00247D', '#FFFFFF'),
  kit('nigeria', 'Nigeria', 'country', '#008751', '#FFFFFF', '#FFFFFF', '#008751'),
  kit('norway', 'Norway', 'country', '#BA0C2F', '#FFFFFF', '#00205B', '#FFFFFF'),
  kit('peru', 'Peru', 'country', '#D91023', '#FFFFFF', '#FFFFFF', '#D91023'),
  kit('poland', 'Poland', 'country', '#FFFFFF', '#DC143C', '#DC143C', '#FFFFFF'),
  kit('portugal', 'Portugal', 'country', '#006600', '#FFCC00', '#CC0000', '#FFCC00'),
  kit('scotland', 'Scotland', 'country', '#0065BF', '#FFFFFF', '#FFFFFF', '#0065BF'),
  kit('senegal', 'Senegal', 'country', '#00853F', '#FDEF42', '#E31B23', '#FDEF42'),
  kit('serbia', 'Serbia', 'country', '#C6363C', '#0C4076', '#FFFFFF', '#0C4076'),
  kit('south-africa', 'South Africa', 'country', '#007A4D', '#FFB612', '#002395', '#DE3831'),
  kit('south-korea', 'South Korea', 'country', '#FFFFFF', '#CD2E3A', '#0047A0', '#CD2E3A'),
  kit('spain', 'Spain', 'country', '#AA151B', '#F1BF00', '#F1BF00', '#AA151B'),
  kit('sweden', 'Sweden', 'country', '#006AA7', '#FECC00', '#FECC00', '#006AA7'),
  kit('switzerland', 'Switzerland', 'country', '#D52B1E', '#FFFFFF', '#FFFFFF', '#D52B1E'),
  kit('turkey', 'Turkey', 'country', '#E30A17', '#FFFFFF', '#FFFFFF', '#E30A17'),
  kit('ukraine', 'Ukraine', 'country', '#005BBB', '#FFD500', '#FFD500', '#005BBB'),
  kit('united-states', 'United States', 'country', '#FFFFFF', '#002868', '#BF0A30', '#002868'),
  kit('uruguay', 'Uruguay', 'country', '#FFFFFF', '#5B9BD5', '#5B9BD5', '#FFFFFF'),
  kit('wales', 'Wales', 'country', '#C8102E', '#FFFFFF', '#00AB39', '#FFFFFF'),
];

const BY_ID = new Map(KIT_COLOURS.map((option) => [option.id, option]));

export function getKitColour(id: string): KitColour | null {
  return BY_ID.get(id) ?? null;
}

export function clothingEquals(a: ClothingColors, b: ClothingColors): boolean {
  return a.shirt.toLowerCase() === b.shirt.toLowerCase()
    && a.shirtTrim.toLowerCase() === b.shirtTrim.toLowerCase()
    && a.shorts.toLowerCase() === b.shorts.toLowerCase()
    && a.socks.toLowerCase() === b.socks.toLowerCase();
}

export function matchKitColour(clothing: ClothingColors): KitColour | null {
  return KIT_COLOURS.find((option) => clothingEquals(option.clothing, clothing)) ?? null;
}

export function kitColoursInGroup(group: KitColourGroup): readonly KitColour[] {
  return KIT_COLOURS.filter((option) => option.group === group);
}
