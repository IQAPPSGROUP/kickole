import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeAppearance } from './appearance';
import { readFileSync } from 'node:fs';
import { kitShirtMask } from '../scene/kitPattern';
import {
  CUSTOM_KIT_ID,
  HISTORICAL_KIT,
  KIT_BOOT,
  NEUTRAL_KIT_ID,
  clothingEquals,
  clothingFor,
  getKitColour,
  kitColoursInGroup,
  kitTileLabel,
  matchKitColour,
} from './kitColours';

const GRAHAM_SHEET: readonly [string, string, string, string, string, string, string][] = [
  ['england', 'England colours', 'halves', '#FFFFFF', '#C8102E', '#C8102E', '#FFFFFF'],
  ['scotland', 'Scotland colours', 'hoops', '#0B2A5B', '#FFFFFF', '#FFFFFF', '#0B2A5B'],
  ['wales', 'Wales colours', 'halves', '#C8102E', '#00843D', '#FFFFFF', '#00843D'],
  ['northern-ireland', 'Northern Ireland colours', 'sash', '#FFFFFF', '#C8102E', '#FFFFFF', '#C8102E'],
  ['ireland', 'Ireland colours', 'chevron', '#FFFFFF', '#169B62', '#FF883E', '#169B62'],
  ['france', 'France colours', 'sleeves', '#ED2939', '#002395', '#FFFFFF', '#002395'],
  ['spain', 'Spain colours', 'sash', '#F1BF00', '#AA151B', '#AA151B', '#F1BF00'],
  ['portugal', 'Portugal colours', 'hoops', '#006600', '#FF0000', '#006600', '#FF0000'],
  ['germany', 'Germany colours', 'chevron', '#FFCE00', '#000000', '#DD0000', '#000000'],
  ['italy', 'Italy colours', 'sleeves', '#009246', '#FFFFFF', '#CE2B37', '#009246'],
  ['netherlands', 'Netherlands colours', 'hoops', '#FF6F00', '#FFFFFF', '#21468B', '#FF6F00'],
  ['brazil', 'Brazil colours', 'halves', '#009C3B', '#FFDF00', '#002776', '#FFDF00'],
  ['argentina', 'Argentina colours', 'chevron', '#FFFFFF', '#74ACDF', '#74ACDF', '#FFFFFF'],
  ['usa', 'USA colours', 'sash', '#0A3161', '#B31942', '#FFFFFF', '#B31942'],
  ['nigeria', 'Nigeria colours', 'stripes', '#008751', '#FFFFFF', '#008751', '#FFFFFF'],
  ['japan', 'Japan colours', 'sleeves', '#BC002D', '#FFFFFF', '#FFFFFF', '#BC002D'],
];

describe('kit colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('matches Graham’s kit sheet and keeps a neutral default', () => {
    expect(kitColoursInGroup('nation').map((option) => option.id)).toEqual(GRAHAM_SHEET.map((row) => row[0]));
    expect(kitColoursInGroup('neutral').map((option) => option.id)).toEqual(['neutral']);
    for (const [id, label, pattern, shirt, secondary, shorts, socks] of GRAHAM_SHEET) {
      const option = getKitColour(id);
      expect(option?.label).toBe(label);
      expect(option?.pattern).toBe(pattern);
      expect(clothingFor(option!)).toEqual({ shirt, shirtTrim: secondary, shorts, socks });
      expect(option?.label.endsWith(' colours')).toBe(true);
      expect(option?.label.toLowerCase()).not.toMatch(/official|country|price|coin/);
    }
    expect(kitTileLabel(getKitColour('northern-ireland')!)).toBe('N. Ireland');
    expect(getKitColour('northern-ireland')?.label).toBe('Northern Ireland colours');
    expect(kitShirtMask('sleeves', 0.05, 0.4)).toBe(0);
    expect(kitShirtMask('sleeves', 0.3, 0.4)).toBe(1);
    expect(kitShirtMask('halves', 0.1, 0.4)).toBe(1);
    expect(kitShirtMask('halves', -0.1, 0.4)).toBe(0);
    const picker = readFileSync(new URL('../ui/KitColours.tsx', import.meta.url), 'utf8');
    expect(picker).toContain('Choose your kit');
    expect(picker).toContain('Use these colours');
    expect(picker).toContain('kitTileLabel(option)');
    expect(picker).toContain('aria-label={option.label}');
    expect(readFileSync(new URL('./kitColours.ts', import.meta.url), 'utf8')).toContain("tile?: string");
    expect(readFileSync(new URL('./kitColours.ts', import.meta.url), 'utf8')).toContain("'N. Ireland'");
    expect(picker.toLowerCase()).not.toMatch(/price|coin|unlock/);
    expect(picker.toLowerCase()).not.toContain('country');
    const nick = readFileSync(new URL('../ui/NicknameScreen.tsx', import.meta.url), 'utf8');
    const rank = readFileSync(new URL('../ui/WorldRank.tsx', import.meta.url), 'utf8');
    expect(nick).not.toContain('country-flag');
    expect(rank).not.toContain('country-flag');
    const submit = readFileSync(new URL('./supabaseLeaderboard.ts', import.meta.url), 'utf8');
    expect(submit).not.toContain('kitColour');
    expect(submit).toContain('run_token');
    expect(submit).toContain('country');
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
    expect(c.getSnapshot().skin.kitPaint).toEqual({ pattern: 'sleeves', main: '#BC002D', secondary: '#FFFFFF' });
    expect(c.getSnapshot().skin.boots.main).toBe(KIT_BOOT);
    expect(JSON.parse(data['kicky.save.v1']).appearance.kitColourId).toBe('japan');
    c.setKitColour('missing');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('japan');
  });
});
