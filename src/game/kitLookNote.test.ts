import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIT_COLOURS } from './kitColours';
import { KIT_HELPER_NOTE, kitHelperNote } from './kitLookNote';

const FORBIDDEN = /\b(official|replica|federation|fifa|uefa|concacaf|conmebol|caf|afc|ofc|nike|adidas|puma|kappa|umbro|hummel|macron|manufacturer)\b/i;

describe('kit helper note', () => {
  it('uses one kit-neutral sentence for every kit', () => {
    expect(KIT_COLOURS.length).toBeGreaterThan(200);
    expect(KIT_HELPER_NOTE).toBe('Pick a colour for your shirt. Bands use the flag colours.');
    for (const kit of KIT_COLOURS) {
      const note = kitHelperNote(kit);
      expect(note, kit.id).toBe(KIT_HELPER_NOTE);
      expect(note).not.toMatch(FORBIDDEN);
      expect(note.toLowerCase()).not.toContain(kit.name.toLowerCase());
      expect(note).not.toContain(kit.id);
    }
  });

  it('shows that sentence in Customise and fades the kit tabs', () => {
    const wardrobe = readFileSync(new URL('../ui/Wardrobe.tsx', import.meta.url), 'utf8');
    expect(wardrobe).toContain('kitHelperNote(kit)');
    expect(wardrobe).toContain('KIT_HELPER_NOTE');
    expect(wardrobe).not.toContain('fans recognise');
    expect(wardrobe).not.toContain('Plain yellow shirt');
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    const fade = css.slice(css.indexOf('.kit-tab-scroller'), css.indexOf('.kit-tabs {'));
    expect(fade).toContain('linear-gradient(to right, transparent, #0F1A14)');
    expect(fade).toContain('width: 24px');
    expect(css).toContain('.kit-tab-scroller { position: relative; margin-right: -22px; }');
    expect(fade).not.toMatch(/arrow|chevron/i);
    const tabs = css.slice(css.indexOf('.kit-tabs {'), css.indexOf('.kit-tab {'));
    expect(tabs).toContain('overflow-x: auto');
    expect(tabs).not.toContain('mask-image');
    const picker = readFileSync(new URL('../ui/KitColours.tsx', import.meta.url), 'utf8');
    expect(picker).not.toMatch(/arrow|chevron/i);
  });
});
