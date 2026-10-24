import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeAppearance } from './appearance';
import { kitShirtMask, trimBandIndex } from '../scene/kitPattern';
import {
  CUSTOM_KIT_ID,
  HISTORICAL_KIT,
  KIT_BOOT,
  KIT_COLOURS,
  NEUTRAL_KIT_ID,
  POPULAR_KIT_IDS,
  clothingEquals,
  clothingFor,
  filterKits,
  getKitColour,
  kitColoursInGroup,
  kitTileLabel,
  matchKitColour,
} from './kitColours';

const APPROVED = {
  england: { pattern: 'plain', shirt: '#FFFFFF', secondary: '#FFFFFF', shorts: '#0B1F4B', socks: '#FFFFFF', trimBands: ['#C8102E', '#FFFFFF'] },
  scotland: { pattern: 'plain', shirt: '#0B2A5B', secondary: '#0B2A5B', shorts: '#FFFFFF', socks: '#0B2A5B', trimBands: ['#005EB8', '#FFFFFF'] },
  wales: { pattern: 'plain', shirt: '#C8102E', secondary: '#C8102E', shorts: '#C8102E', socks: '#C8102E', trimBands: ['#FFFFFF', '#00843D'] },
  'northern-ireland': { pattern: 'plain', shirt: '#00843D', secondary: '#00843D', shorts: '#FFFFFF', socks: '#00843D', trimBands: ['#FFFFFF', '#00843D'] },
  'republic-of-ireland': { pattern: 'plain', shirt: '#169B62', secondary: '#169B62', shorts: '#FFFFFF', socks: '#169B62', trimBands: ['#169B62', '#FFFFFF', '#FF883E'] },
  france: { pattern: 'plain', shirt: '#1E3A8A', secondary: '#1E3A8A', shorts: '#FFFFFF', socks: '#ED2939', trimBands: ['#002395', '#FFFFFF', '#ED2939'] },
  spain: { pattern: 'plain', shirt: '#C8102E', secondary: '#C8102E', shorts: '#0B1F4B', socks: '#C8102E', trimBands: ['#F1BF00', '#AA151B'] },
  portugal: { pattern: 'plain', shirt: '#8B1A1A', secondary: '#8B1A1A', shorts: '#006600', socks: '#8B1A1A', trimBands: ['#006600', '#FFE000', '#FF0000'] },
  germany: { pattern: 'plain', shirt: '#FFFFFF', secondary: '#FFFFFF', shorts: '#111111', socks: '#FFFFFF', trimBands: ['#111111', '#DD0000', '#FFCE00'] },
  italy: { pattern: 'plain', shirt: '#2F7FD8', secondary: '#2F7FD8', shorts: '#FFFFFF', socks: '#2F7FD8', trimBands: ['#009246', '#FFFFFF', '#CE2B37'] },
  netherlands: { pattern: 'plain', shirt: '#FF6F00', secondary: '#FF6F00', shorts: '#FF6F00', socks: '#FF6F00', trimBands: ['#AE1C28', '#FFFFFF', '#21468B'] },
  sweden: { pattern: 'plain', shirt: '#FECC02', secondary: '#FECC02', shorts: '#006AA7', socks: '#FECC02', trimBands: ['#006AA7', '#FECC02'] },
  brazil: { pattern: 'plain', shirt: '#FFDC02', secondary: '#FFDC02', shorts: '#1F3C8F', socks: '#FFFFFF', trimBands: ['#009C3B', '#FFDF00', '#002776'] },
  argentina: { pattern: 'stripes', shirt: '#FFFFFF', secondary: '#75AADB', shorts: '#111111', socks: '#FFFFFF', trimBands: ['#75AADB', '#FFFFFF'] },
  usa: { pattern: 'plain', shirt: '#FFFFFF', secondary: '#FFFFFF', shorts: '#0A3161', socks: '#FFFFFF', trimBands: ['#B31942', '#FFFFFF', '#0A3161'] },
  nigeria: { pattern: 'plain', shirt: '#008751', secondary: '#008751', shorts: '#008751', socks: '#008751', trimBands: ['#008751', '#FFFFFF'] },
  japan: { pattern: 'plain', shirt: '#1B2F87', secondary: '#1B2F87', shorts: '#1B2F87', socks: '#1B2F87', trimBands: ['#BC002D', '#FFFFFF'] },
} as const;

describe('kit colours', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('loads Graham\'s kit sheet and groups it by confederation', () => {
    const nations = kitColoursInGroup('nation');
    expect(nations).toHaveLength(211);
    expect(kitColoursInGroup('neutral').map((option) => option.id)).toEqual(['neutral']);
    expect(new Set(KIT_COLOURS.map((option) => option.id)).size).toBe(KIT_COLOURS.length);
    const confederations = { UEFA: 0, CONMEBOL: 0, CONCACAF: 0, CAF: 0, AFC: 0, OFC: 0 };
    const striped = nations.filter((option) => option.pattern === 'stripes').map((option) => option.id);
    expect(striped).toEqual(['argentina', 'paraguay']);
    for (const option of nations) {
      expect(option.label).toBe(`${option.name} colours`);
      expect(option.label.toLowerCase()).not.toMatch(/official|price|coin|crest|logo/);
      expect(option.confederation && option.confederation in confederations).toBe(true);
      if (option.confederation) confederations[option.confederation] += 1;
      for (const hex of [option.shirt, option.secondary, option.shorts, option.socks, ...option.trimBands]) {
        expect(hex).toMatch(/^#[0-9A-F]{6}$/);
      }
      expect(option.trimBands.length).toBeGreaterThanOrEqual(2);
      expect(option.trimBands.length).toBeLessThanOrEqual(6);
      expect(clothingFor(option)).toEqual({
        shirt: option.shirt,
        shirtTrim: option.trimBands[0],
        shorts: option.shorts,
        socks: option.socks,
      });
    }
    expect(confederations).toEqual({ UEFA: 55, CONMEBOL: 10, CONCACAF: 35, CAF: 54, AFC: 46, OFC: 11 });
    for (const [id, expected] of Object.entries(APPROVED)) {
      expect(getKitColour(id)).toMatchObject(expected);
    }
    expect(getKitColour('republic-of-ireland')?.label).toBe('Republic of Ireland colours');
    expect(kitTileLabel(getKitColour('republic-of-ireland')!)).toBe('Rep. of Ireland');
    expect(getKitColour('usa')?.label).toBe('USA colours');
    expect(kitTileLabel(getKitColour('northern-ireland')!)).toBe('N. Ireland');
    expect(getKitColour('northern-ireland')?.trimBands).toEqual(['#FFFFFF', '#00843D']);
    expect(getKitColour('anguilla')).toMatchObject({
      pattern: 'plain', shirt: '#F28C00', shorts: '#0B1F4B', socks: '#F28C00',
      trimBands: ['#1E4FA8', '#FFFFFF', '#F28C00'],
    });
    expect(getKitColour('us-virgin-islands')).toMatchObject({
      pattern: 'plain', shirt: '#6CB4E4', shorts: '#6CB4E4', socks: '#6CB4E4',
      trimBands: ['#FFFFFF', '#FCD116', '#1E4FA8'],
    });
    expect(getKitColour('lesotho')).toMatchObject({
      pattern: 'plain', shirt: '#007A3D', shorts: '#007A3D', socks: '#007A3D',
      trimBands: ['#1E4FA8', '#FFFFFF', '#007A3D'],
    });
    expect(getKitColour('paraguay')).toMatchObject({ pattern: 'stripes', secondary: '#D52B1E' });
    expect(filterKits('popular', '').map((option) => option.id)).toEqual(['neutral', ...POPULAR_KIT_IDS]);
    const uefa = filterKits('UEFA', '');
    expect(uefa.every((option) => option.confederation === 'UEFA')).toBe(true);
    expect(uefa).toHaveLength(55);
    const uefaLabels = uefa.map((option) => kitTileLabel(option));
    expect(uefaLabels).toEqual([...uefaLabels].sort((a, b) => a.localeCompare(b, 'en')));
    expect(filterKits('AFC', 'japan').map((option) => option.id)).toEqual(['japan']);
    expect(filterKits('UEFA', 'japan').map((option) => option.id)).toEqual(['japan']);
    expect(filterKits('UEFA', 'IR Iran').map((option) => option.id)).toEqual(['ir-iran']);
    expect(kitShirtMask('plain', 0.2, 0.4)).toBe(0);
    expect(kitShirtMask('plain', -0.3, 0.1)).toBe(0);
    expect(kitShirtMask('stripes', 0, 0.2)).toBe(kitShirtMask('stripes', 0, 0.55));
    expect(kitShirtMask('stripes', 0, 0.4)).not.toBe(kitShirtMask('stripes', 0.06, 0.4));
    expect(trimBandIndex(3, 0)).toBe(0);
    expect(trimBandIndex(3, 0.34)).toBe(1);
    expect(trimBandIndex(3, 0.99)).toBe(2);
    const picker = readFileSync(new URL('../ui/KitColours.tsx', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
    expect(picker).toContain('Choose your kit');
    expect(picker).toContain('Use this kit');
    expect(picker).toContain('Search kits');
    expect(picker).toContain('Popular');
    expect(picker).toContain('KIT_CONFEDERATIONS');
    expect(picker).toContain('Kit confederations');
    expect(picker).toContain('No kits in this list yet.');
    expect(picker).toContain('kitTileLabel(option)');
    expect(picker).toContain('aria-label={option.label}');
    expect(picker).not.toContain('Use these colours');
    expect(picker.toLowerCase()).not.toMatch(/price|coin|unlock/);
    expect(picker.toLowerCase()).not.toContain('country');
    expect(css).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(css).toContain('background: #0F1A14');
    expect(css).toContain('background: #1C2B22');
    expect(css).toContain('border: 4px solid transparent');
    const nick = readFileSync(new URL('../ui/NicknameScreen.tsx', import.meta.url), 'utf8');
    const rank = readFileSync(new URL('../ui/WorldRank.tsx', import.meta.url), 'utf8');
    expect(nick).not.toContain('country-flag');
    expect(rank).not.toContain('country-flag');
    const submit = readFileSync(new URL('./supabaseLeaderboard.ts', import.meta.url), 'utf8');
    expect(submit).not.toContain('kitColour');
    expect(submit).toContain('run_token');
    expect(submit).toContain('country');
    const sheet = readFileSync(new URL('../../docs/design-refs/national-kits/spec.json', import.meta.url), 'utf8');
    const rows = JSON.parse(sheet) as { name: string; boots: string }[];
    expect(rows).toHaveLength(211);
    expect(rows.every((row) => row.boots === '#2B2B2B')).toBe(true);
    expect(rows.map((row) => row.name)).toContain('Republic of Ireland');
    expect(rows.map((row) => row.name)).toContain('USA');
    expect(rows.map((row) => row.name)).toContain('Paraguay');
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
    expect(c.getSnapshot().skin.kitPaint).toEqual({
      pattern: japan.pattern,
      main: japan.shirt,
      secondary: japan.secondary,
      socks: japan.socks,
      trim: japan.trimBands,
    });
    expect(c.getSnapshot().skin.boots.main).toBe(KIT_BOOT);
    c.setKitColour('sweden');
    const sweden = colours.getKitColour('sweden')!;
    expect(sweden.pattern).toBe('plain');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('sweden');
    expect(c.getSnapshot().skin.clothing).toEqual(colours.clothingFor(sweden));
    expect(c.getSnapshot().skin.kitPaint).toEqual({
      pattern: 'plain',
      main: sweden.shirt,
      secondary: sweden.secondary,
      socks: sweden.socks,
      trim: sweden.trimBands,
    });
    expect(c.getSnapshot().skin.boots.main).toBe(KIT_BOOT);
    expect(data['kicky.country.v1']).toBe('GB');
    expect(JSON.parse(data['kicky.save.v1']).appearance.kitColourId).toBe('sweden');
    c.setKitColour('missing');
    expect(c.getSnapshot().save.appearance.kitColourId).toBe('sweden');
  });
});
