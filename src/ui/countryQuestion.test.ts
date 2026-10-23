import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRY_BOARD_MIN } from '../game/leaderboard';
import { loadStoredCountry, saveCountry } from '../game/nicknameStore';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('optional country question', () => {
  const nick = source('./NicknameScreen.tsx');
  const screens = source('./Screens.tsx');
  const app = source('./App.tsx');
  const rank = source('./WorldRank.tsx');
  const kit = source('./KitColours.tsx');
  const controller = source('../game/controller.ts');

  it('asks for a country separately from the kit, with prefer not to say as the default', () => {
    expect(COUNTRY_BOARD_MIN).toBe(20);
    expect(nick).toContain('Prefer not to say is the default');
    expect(nick).toContain('Your kit does not choose a country');
    expect(nick).toContain('export function CountryScreen');
    expect(nick).not.toContain('country-flag');
    expect(nick).not.toContain('countryFlag');
    const form = nick.slice(nick.indexOf('export function NicknameForm'), nick.indexOf('function otherIndex'));
    expect(form).not.toContain('CountryPicker');
    expect(form).not.toContain('country');
    expect(kit.toLowerCase()).not.toContain('country');
    expect(controller).not.toMatch(/setKitColour[\s\S]*country/);
    expect(app).toContain('<CountryScreen');
    expect(app).toContain('needsCountry');
  });

  it('keeps country off names on the world board, nickname preview, and world rank', () => {
    const row = screens.slice(screens.indexOf('rows.map'), screens.indexOf('</ol>'));
    expect(row).not.toContain('row.country');
    expect(row).not.toContain('countryFlag');
    expect(row).toContain('{row.nickname}');
    expect(rank).not.toContain('country');
    expect(screens).toContain('is not shown next to your name');
    expect(screens).toContain('A country board appears once {COUNTRY_BOARD_MIN} players have joined.');
  });

  it('stores prefer not to say as the saved skip and can clear a country later', () => {
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => { memory.set(key, value); },
      removeItem: (key: string) => { memory.delete(key); },
      clear: () => { memory.clear(); },
      key: (index: number) => [...memory.keys()][index] ?? null,
      get length() { return memory.size; },
    } as Storage;
    expect(loadStoredCountry(storage)).toEqual({ chosen: false, country: null });
    expect(saveCountry(null, storage)).toBe(true);
    expect(loadStoredCountry(storage)).toEqual({ chosen: true, country: null });
    expect(saveCountry('SE', storage)).toBe(true);
    expect(loadStoredCountry(storage).country).toBe('SE');
    expect(saveCountry(null, storage)).toBe(true);
    expect(loadStoredCountry(storage)).toEqual({ chosen: true, country: null });
  });
});
