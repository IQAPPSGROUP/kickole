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

  it('asks for a country separately from the kit, with International as the default', () => {
    expect(COUNTRY_BOARD_MIN).toBe(20);
    expect(nick).toContain('Optional. The flag of the country you choose is shown to everyone beside your nickname.');
    expect(nick).not.toContain('is not shown next to your name');
    expect(screens).toContain('International is the default');
    expect(nick).toContain("selected ? selected.name : 'International'");
    expect(nick).toContain('International\n');
    expect(nick).not.toContain('Prefer not to say');
    expect(nick).toContain("submitLabel ?? 'Continue'");
    expect(nick).not.toContain('Suggested:');
    expect(nick).not.toContain('suggestedCountry');
    expect(nick).not.toContain('navigator.language');
    expect(screens).toContain('International is the default');
    expect(screens).toContain('submitLabel="SAVE"');
    expect(screens).not.toContain('Prefer not to say');
    expect(screens).not.toContain('suggestedCountry');
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

  it('shows the chosen country flag beside nicknames on the boards', () => {
    const row = screens.slice(screens.indexOf('rows.map'), screens.indexOf('</ol>'));
    expect(row).toContain('<NameFlag country={row.country} />');
    expect(row).toContain('{row.nickname}');
    expect(screens).toContain('NameFlag country={mine?.country ?? board.country}');
    expect(screens).not.toContain('is not shown next to your name');
    expect(rank).toContain('<NameFlag country={snapshot.country} />');
    expect(screens).toContain('A country board appears once {COUNTRY_BOARD_MIN} players have joined.');
    expect(screens).toContain('Leaderboard appears once ${COUNTRY_BOARD_MIN} players have scored');
    expect(screens).toContain('{!page.hidden && (');
    const over = screens.slice(screens.indexOf('export function GameOver'), screens.indexOf('type SheetStep'));
    expect(over).toContain('LEADERBOARD');
    expect(over).not.toContain('className="board"');
    expect(rank).toContain('snapshot.worldHidden ? null : snapshot.rank');
    expect(rank).toContain('Leaderboard appears once ${COUNTRY_BOARD_MIN} players have scored');
    expect(rank).toContain('{!snapshot.worldHidden && <p className="world-rank-name">');
    const boardSource = source('../game/leaderboard.ts');
    expect(boardSource).toContain("if (scope === 'country' && rows.length < COUNTRY_BOARD_MIN)");
    expect(boardSource).toContain("if (scope === 'world' && rows.length < COUNTRY_BOARD_MIN)");
  });

  it('stores International as no country and can clear a country later', () => {
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
