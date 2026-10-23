import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByCode, countryFlag, searchCountries } from './countries';
import { COUNTRY_KEY, loadStoredCountry, saveCountry } from './nicknameStore';

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    clear: () => { data.clear(); },
    key: (index: number) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  } satisfies Storage;
}

describe('countries', () => {
  it('lists each ISO alpha-2 code once', () => {
    expect(COUNTRIES).toHaveLength(249);
    const codes = COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(249);
    expect(codes.every((code) => /^[A-Z]{2}$/.test(code))).toBe(true);
    expect(countryByCode('gb')?.name).toBe('United Kingdom');
  });

  it('does not guess a country from the device', () => {
    const source = readFileSync(new URL('./countries.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('suggestedCountry');
    expect(source).not.toContain('navigator');
    expect(source).not.toContain('Intl.Locale');
    expect(source).not.toContain('timeZone');
    expect(source).not.toContain('geolocation');
  });

  it('builds a flag and a searchable list', () => {
    expect(countryFlag('GB')).toBe('🇬🇧');
    expect(countryFlag('nope')).toBe('');
    expect(searchCountries('united king').map((country) => country.code)).toEqual(['GB']);
    expect(searchCountries('turkey').map((country) => country.code)).toContain('TR');
  });

  it('stores a chosen country and International separately from a missing key', () => {
    const storage = memory();
    expect(loadStoredCountry(storage)).toEqual({ chosen: false, country: null });
    expect(saveCountry('gb', storage)).toBe(true);
    expect(storage.getItem(COUNTRY_KEY)).toBe('GB');
    expect(loadStoredCountry(storage)).toEqual({ chosen: true, country: 'GB' });
    expect(saveCountry(null, storage)).toBe(true);
    expect(storage.getItem(COUNTRY_KEY)).toBe('none');
    expect(loadStoredCountry(storage)).toEqual({ chosen: true, country: null });
    storage.setItem(COUNTRY_KEY, 'ZZ');
    expect(loadStoredCountry(storage)).toEqual({ chosen: false, country: null });
    storage.setItem(COUNTRY_KEY, 'nope');
    expect(loadStoredCountry(storage).country).toBeNull();
    expect(saveCountry('ZZ', storage)).toBe(false);
  });
});
