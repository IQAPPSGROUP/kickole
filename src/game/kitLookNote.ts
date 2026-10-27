import type { KitColour, KitPattern } from './kitColours';

/**
 * Short colour name for a kit hex. The same hex always gets the same name.
 * Names stay plain: no crests, clubs or federations.
 */
export function plainColourName(hex: string): string {
  const { h, s, l } = hexHsl(hex);
  if (s < 0.2) {
    if (l >= 0.9) return 'white';
    if (l <= 0.14) return 'black';
    if (l >= 0.7) return 'light grey';
    if (l <= 0.32) return 'dark grey';
    return 'grey';
  }
  const family = hueFamily(h);
  const darkBelow = family === 'red' || family === 'orange' ? 0.36 : family === 'green' ? 0.28 : 0.32;
  if (family === 'blue' && l < 0.26) return 'navy';
  if (l < darkBelow) return `dark ${family}`;
  if (l >= 0.64) return `light ${family}`;
  return family;
}

/** Customise helper. Describes this kit’s shirt, shorts, socks and trim. */
export function kitLookNote(kit: KitColour): string {
  const shorts = plainColourName(kit.shorts);
  const socks = plainColourName(kit.socks);
  const lower = shorts === socks ? `${shorts} shorts and socks` : `${shorts} shorts and ${socks} socks`;
  const bands = listColours(kit.trimBands.map(plainColourName));
  return `${shirtPhrase(kit)}, ${lower}, with thin ${bands} bands. Saved on this device.`;
}

function shirtPhrase(kit: KitColour): string {
  const pattern: KitPattern = kit.pattern;
  switch (pattern) {
    case 'plain':
      return `Plain ${plainColourName(kit.shirt)} shirt`;
    case 'stripes':
      return `${capitalise(plainColourName(kit.shirt))} and ${plainColourName(kit.secondary)} striped shirt`;
    default: {
      const unexpected: never = pattern;
      return unexpected;
    }
  }
}

function listColours(names: readonly string[]): string {
  const collapsed = names.filter((name, index) => name !== names[index - 1]);
  if (collapsed.length <= 1) return collapsed[0] ?? '';
  if (collapsed.length === 2) return `${collapsed[0]} and ${collapsed[1]}`;
  return `${collapsed.slice(0, -1).join(', ')} and ${collapsed[collapsed.length - 1]}`;
}

function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function hueFamily(hue: number): string {
  if (hue < 15 || hue >= 348) return 'red';
  if (hue < 40) return 'orange';
  if (hue < 70) return 'yellow';
  if (hue < 165) return 'green';
  if (hue < 195) return 'teal';
  if (hue < 255) return 'blue';
  if (hue < 320) return 'purple';
  return 'pink';
}

function hexHsl(hex: string): { h: number; s: number; l: number } {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue: number;
  if (max === red) hue = ((green - blue) / delta) % 6;
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}
