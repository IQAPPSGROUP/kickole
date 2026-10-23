import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAppearance } from './appearance';
import { readFileSync } from 'node:fs';
import {
  CUSTOM_KIT_ID,
  HISTORICAL_KIT,
  KIT_COLOURS,
  NEUTRAL_KIT_ID,
  clothingEquals,
  clothingFor,
  getKitColour,
  kitColoursInGroup,
  matchKitColour,
} from './kitColours';

describe('kit colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('lists sixteen nation kits plus neutrals as replaceable colour sheets', () => {
    expect(kitColoursInGroup('nation').length).toBe(16);
    expect(kitColoursInGroup('neutral').length).toBeGreaterThanOrEqual(3);
    const ids = KIT_COLOURS.map((option) => option.id);
    expect(new Set(ids).size).toBe(ids.length);
    const paints = KIT_COLOURS.map((option) => JSON.stringify(clothingFor(option)));
    expect(new Set(paints).size).toBe(paints.length);
    const patterns = new Set(KIT_COLOURS.map((option) => option.pattern));
    expect(patterns).toEqual(new Set(['plain', 'stripes', 'hoops', 'halves', 'sash']));
    for (const option of KIT_COLOURS) {
      const clothing = clothingFor(option);
      expect(clothing.shirt).toMatch(/^#[0-9A-F]{6}$/);
      expect(clothing.shirtTrim).toMatch(/^#[0-9A-F]{6}$/);
      expect(clothing.shorts).toMatch(/^#[0-9A-F]{6}$/);
      expect(clothing.socks).toMatch(/^#[0-9A-F]{6}$/);
      expect(option.label.toLowerCase()).not.toMatch(/crest|badge|sponsor|nike|adidas|official|country/);
      if (option.kind === 'nation') expect(option.label.endsWith(' colours')).toBe(true);
    }
    const picker = readFileSync(new URL('../ui/KitColours.tsx', import.meta.url), 'utf8');
    expect(picker).toContain('Choose your kit');
    expect(picker.toLowerCase()).not.toContain('country');
    const board = readFileSync(new URL('../ui/Screens.tsx', import.meta.url), 'utf8');
    const rank = readFileSync(new URL('../ui/WorldRank.tsx', import.meta.url), 'utf8');
    expect(board).not.toContain('country-flag');
    expect(rank).not.toContain('country-flag');
    const submit = readFileSync(new URL('./supabaseLeaderboard.ts', import.meta.url), 'utf8');
    expect(submit).not.toContain('kitColour');
    expect(submit).toContain('run_token');
  });

  it('defaults a new look to the neutral kit and rejects an unknown id', () => {
    const fresh = normalizeAppearance(undefined);
    const neutral = getKitColour(NEUTRAL_KIT_ID)!;
    expect(fresh.kitColourId).toBe(NEUTRAL_KIT_ID);
    expect(fresh.clothing).toEqual(clothingFor(neutral));
    const unknown = normalizeAppearance({ kitColourId: 'not-a-kit', clothing: { ...clothingFor(neutral), shirt: '#123456' } });
    expect(unknown.kitColourId).toBe(CUSTOM_KIT_ID);
    expect(unknown.clothing.shirt).toBe('#123456');
    const blank = normalizeAppearance({ kitColourId: 'nope' });
    expect(blank.kitColourId).toBe(NEUTRAL_KIT_ID);
    expect(blank.clothing).toEqual(clothingFor(neutral));
  });

  it('keeps a chosen kit, migrates the old yellow kit, and preserves a custom swatch', () => {
    const brazil = getKitColour('brazil')!;
    const chosen = normalizeAppearance({
      kitColourId: 'brazil',
      clothing: { shirt: '#111111', shirtTrim: '#222222', shorts: '#333333', socks: '#444444' },
    });
    expect(chosen.kitColourId).toBe('brazil');
    expect(chosen.clothing).toEqual(clothingFor(brazil));

    const migrated = normalizeAppearance({ clothing: { ...HISTORICAL_KIT } });
    expect(migrated.kitColourId).toBe(NEUTRAL_KIT_ID);
    expect(clothingEquals(migrated.clothing, HISTORICAL_KIT)).toBe(false);

    const custom = { shirt: '#9B59B6', shirtTrim: '#111111', shorts: '#222222', socks: '#333333' };
    const kept = normalizeAppearance({ clothing: custom });
    expect(kept.kitColourId).toBe(CUSTOM_KIT_ID);
    expect(kept.clothing).toEqual(custom);
    expect(matchKitColour(custom)).toBeNull();
  });

  it('saves the choice on this device and tints the basic kit', async () => {
    vi.resetModules();
    const data: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => (key in data ? data[key] : null),
      setItem: (key: string, value: string) => { data[key] = value; },
      removeItem: (key: string) => { delete data[key]; },
    });
    vi.stubGlobal('navigator', { vibrate: vi.fn() });
    const { GameController } = await import('./controller');
    const colours = await import('./kitColours');
    const c = new GameController();
    expect(c.getSnapshot().save.appearance.kitColourId).toBe(colours.NEUTRAL_KIT_ID);
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(colours.getKitColour('neutral')!));
    c.setKitColour('japan');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('japan');
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(colours.getKitColour('japan')!));
    expect(c.getSnapshot().skin.kitPaint).toEqual({ pattern: 'plain', colours: ['#FFFFFF', '#BC002D'] });
    expect(JSON.parse(data['kicky.save.v1']).appearance.kitColourId).toBe('japan');
    c.setKitColour('missing');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('japan');
  });
});
