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

describe('kit colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('keeps a data-driven list, mask patterns, and unfinalised colours', () => {
    const nations = kitColoursInGroup('nation');
    expect(nations.map((option) => option.id)).toEqual([
      'england', 'scotland', 'wales', 'northern-ireland', 'ireland', 'france', 'spain',
      'portugal', 'germany', 'italy', 'netherlands', 'brazil', 'argentina', 'usa',
      'nigeria', 'japan', 'sweden',
    ]);
    expect(kitColoursInGroup('neutral').map((option) => option.id)).toEqual(['neutral']);
    const sweden = getKitColour('sweden');
    expect(sweden).toMatchObject({ label: 'Sweden colours', kind: 'nation', pattern: 'plain' });
    expect(kitTileLabel(sweden!)).toBe('Sweden colours');
    const sheet = readFileSync(new URL('./kitColours.ts', import.meta.url), 'utf8');
    expect(sheet).toContain('Colour values are on hold');
    expect(sheet).toContain('placeholders, not a final sheet');
    for (const option of nations) {
      expect(option.label.endsWith(' colours')).toBe(true);
      expect(option.label.toLowerCase()).not.toMatch(/official|country|price|coin/);
      for (const hex of [option.shirt, option.secondary, option.shorts, option.socks]) {
        expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(clothingFor(option)).toEqual({
        shirt: option.shirt,
        shirtTrim: option.secondary,
        shorts: option.shorts,
        socks: option.socks,
      });
    }
    expect(kitTileLabel(getKitColour('northern-ireland')!)).toBe('N. Ireland');
    expect(getKitColour('northern-ireland')?.label).toBe('Northern Ireland colours');
    expect(kitShirtMask('plain', 0.2, 0.4)).toBe(0);
    expect(kitShirtMask('plain', -0.3, 0.1)).toBe(0);
    expect(kitShirtMask('stripes', 0, 0.2)).toBe(kitShirtMask('stripes', 0, 0.55));
    expect(kitShirtMask('stripes', 0, 0.4)).not.toBe(kitShirtMask('stripes', 0.06, 0.4));
    expect(kitShirtMask('hoops', 0, 0.05)).toBe(kitShirtMask('hoops', 0.3, 0.05));
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
    data['kicky.country.v1'] = 'GB';
    const c = new GameController();
    expect(c.getSnapshot().save.appearance.kitColourId).toBe(colours.NEUTRAL_KIT_ID);
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(colours.getKitColour('neutral')!));
    c.setKitColour('japan');
    const japan = colours.getKitColour('japan')!;
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('japan');
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(japan));
    expect(c.getSnapshot().skin.kitPaint).toEqual({ pattern: japan.pattern, main: japan.shirt, secondary: japan.secondary });
    expect(c.getSnapshot().skin.boots.main).toBe(KIT_BOOT);
    c.setKitColour('sweden');
    const sweden = colours.getKitColour('sweden')!;
    expect(sweden.pattern).toBe('plain');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('sweden');
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(sweden));
    expect(c.getSnapshot().skin.kitPaint).toEqual({ pattern: 'plain', main: sweden.shirt, secondary: sweden.secondary });
    expect(c.getSnapshot().skin.boots.main).toBe(KIT_BOOT);
    expect(data['kicky.country.v1']).toBe('GB');
    expect(JSON.parse(data['kicky.save.v1']).appearance.kitColourId).toBe('sweden');
    c.setKitColour('missing');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('sweden');
  });
});
