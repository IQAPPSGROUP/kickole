import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIT_COLOURS, getKitColour } from './kitColours';
import { kitLookNote, plainColourName } from './kitLookNote';

const FORBIDDEN = /\b(crest|logo|badge|federation|fifa|uefa|concacaf|conmebol|caf|afc|ofc|club|official|flag|generated|ai)\b|fans recognise/i;

function hsl(hex: string): { h: number; s: number; l: number } {
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
  let hue = max === red ? ((green - blue) / delta) % 6 : max === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

/** Same plain name is only fair when two hexes would look like one colour. */
function coloursClose(a: string, b: string): boolean {
  const left = hsl(a);
  const right = hsl(b);
  const hueDelta = Math.min(Math.abs(left.h - right.h), 360 - Math.abs(left.h - right.h));
  if (left.s < 0.2 && right.s < 0.2) return Math.abs(left.l - right.l) <= 0.12;
  return hueDelta <= 14 && Math.abs(left.l - right.l) <= 0.12 && Math.abs(left.s - right.s) <= 0.45;
}

describe('kit look notes', () => {
  it('describes every kit from its own colours', () => {
    expect(KIT_COLOURS.length).toBeGreaterThan(200);
    for (const kit of KIT_COLOURS) {
      const note = kitLookNote(kit);
      expect(note.endsWith('Saved on this device.')).toBe(true);
      expect(note).not.toMatch(FORBIDDEN);
      expect(note.toLowerCase()).not.toContain(kit.name.toLowerCase());
      expect(note).not.toContain(kit.id);
      const shirt = plainColourName(kit.shirt);
      const shorts = plainColourName(kit.shorts);
      const socks = plainColourName(kit.socks);
      expect(note).toContain(shorts === socks ? `${shorts} shorts and socks` : `${shorts} shorts and ${socks} socks`);
      for (const band of kit.trimBands) expect(note).toContain(plainColourName(band));
      if (kit.pattern === 'plain') {
        expect(note.startsWith(`Plain ${shirt} shirt`)).toBe(true);
        expect(note).not.toContain('striped');
      } else if (kit.pattern === 'stripes') {
        const secondary = plainColourName(kit.secondary);
        expect(secondary).not.toBe(shirt);
        expect(note.startsWith(`${shirt.charAt(0).toUpperCase()}${shirt.slice(1)} and ${secondary} striped shirt`)).toBe(true);
        expect(note).not.toContain('Plain');
      } else {
        const unexpected: never = kit.pattern;
        throw new Error(unexpected);
      }
      const hexes = [kit.shirt, kit.secondary, kit.shorts, kit.socks, ...kit.trimBands];
      for (let i = 0; i < hexes.length; i += 1) {
        for (let j = i + 1; j < hexes.length; j += 1) {
          if (plainColourName(hexes[i]).toLowerCase() === plainColourName(hexes[j]).toLowerCase()) {
            expect(coloursClose(hexes[i], hexes[j]), `${kit.id} ${hexes[i]} ${hexes[j]}`).toBe(true);
          }
        }
      }
    }
  });

  it('uses the real shirt for Brazil and the striped kits', () => {
    expect(kitLookNote(getKitColour('brazil')!)).toBe(
      'Plain yellow shirt, blue shorts and white socks, with thin green, yellow and navy bands. Saved on this device.',
    );
    expect(kitLookNote(getKitColour('argentina')!)).toBe(
      'White and light blue striped shirt, black shorts and white socks, with thin light blue and white bands. Saved on this device.',
    );
    expect(kitLookNote(getKitColour('paraguay')!)).toBe(
      'White and red striped shirt, blue shorts and socks, with thin red, white and blue bands. Saved on this device.',
    );
    expect(kitLookNote(getKitColour('neutral')!)).toBe(
      'Plain light grey shirt, dark grey shorts and light grey socks, with thin grey and dark grey bands. Saved on this device.',
    );
  });

  it('shows that note in Customise and hints that the kit tabs scroll', () => {
    const wardrobe = readFileSync(new URL('../ui/Wardrobe.tsx', import.meta.url), 'utf8');
    expect(wardrobe).toContain('kitLookNote(kit)');
    expect(wardrobe).not.toContain('fans recognise');
    expect(wardrobe).not.toContain('flag-colour');
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const tabs = css.slice(css.indexOf('.kit-tabs'), css.indexOf('.kit-tab {'));
    expect(tabs).toContain('mask-image:');
    expect(tabs).toContain('scroll-snap-type: x proximity');
    expect(tabs).toContain('overflow-x: auto');
    const tab = css.slice(css.indexOf('.kit-tab {'), css.indexOf('.kit-tab.on'));
    expect(tab).toContain('scroll-snap-align: start');
  });
});
