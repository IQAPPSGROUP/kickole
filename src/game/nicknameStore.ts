import { countryByCode } from './countries';
import { checkNickname } from './nickname';

export const NICKNAME_KEY = 'kicky.nickname.v1';
export const DEVICE_ID_KEY = 'kicky.device.v1';
export const COUNTRY_KEY = 'kicky.country.v1';

/** Stored when the player chooses "Prefer not to say". Missing key means they have not chosen yet. */
const COUNTRY_NONE = 'none';

export interface StoredCountry {
  /** True after a save, including prefer-not-to-say. */
  chosen: boolean;
  /** ISO alpha-2, or null when unset or prefer-not-to-say. */
  country: string | null;
}

export function loadNickname(storage: Storage = localStorage): string | null {
  try {
    const raw = storage.getItem(NICKNAME_KEY);
    if (!raw) return null;
    const check = checkNickname(raw);
    return check.ok ? check.nickname : null;
  } catch {
    return null;
  }
}

export function saveNickname(nickname: string, storage: Storage = localStorage): boolean {
  const check = checkNickname(nickname);
  if (!check.ok) return false;
  try {
    storage.setItem(NICKNAME_KEY, check.nickname);
  } catch {
    return false;
  }
  void mirrorPreference(NICKNAME_KEY, check.nickname);
  return true;
}

/** Random id for this install. It is not shown and is not the player's name. */
export function loadDeviceId(storage: Storage = localStorage): string {
  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing && /^[0-9a-f-]{16,64}$/i.test(existing)) return existing;
  } catch {
    /* fall through and mint one */
  }
  const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `dev-${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
  try {
    storage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* keep the in-memory id for this session */
  }
  void mirrorPreference(DEVICE_ID_KEY, id);
  return id;
}

async function mirrorPreference(key: string, value: string): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key, value });
  } catch {
    /* Web storage already has the value. Native sync can wait for the next cap sync. */
  }
}

/**
 * On a phone, Capacitor Preferences is the source of truth so a nickname survives
 * a WebView storage clear. The browser keeps using localStorage.
 */
export async function hydrateNickname(storage: Storage = localStorage): Promise<string | null> {
  const local = loadNickname(storage);
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return local;
    const { Preferences } = await import('@capacitor/preferences');
    const stored = await Preferences.get({ key: NICKNAME_KEY });
    const remote = stored.value ? checkNickname(stored.value) : null;
    if (remote?.ok) {
      try { storage.setItem(NICKNAME_KEY, remote.nickname); } catch { /* ignore */ }
      return remote.nickname;
    }
    if (local) await Preferences.set({ key: NICKNAME_KEY, value: local });
  } catch {
    /* Preferences is absent in the browser and in tests. */
  }
  return loadNickname(storage);
}

export function loadStoredCountry(storage: Storage = localStorage): StoredCountry {
  try {
    const raw = storage.getItem(COUNTRY_KEY);
    if (raw == null || raw === '') return { chosen: false, country: null };
    if (raw === COUNTRY_NONE) return { chosen: true, country: null };
    const country = countryByCode(raw);
    if (!country) return { chosen: false, country: null };
    return { chosen: true, country: country.code };
  } catch {
    return { chosen: false, country: null };
  }
}

/** `null` stores prefer-not-to-say. A locale guess is not written until the player saves. */
export function saveCountry(country: string | null, storage: Storage = localStorage): boolean {
  const stored = country == null ? COUNTRY_NONE : countryByCode(country)?.code;
  if (!stored) return false;
  try {
    storage.setItem(COUNTRY_KEY, stored);
  } catch {
    return false;
  }
  void mirrorPreference(COUNTRY_KEY, stored);
  return true;
}

export async function hydrateCountry(storage: Storage = localStorage): Promise<StoredCountry> {
  const local = loadStoredCountry(storage);
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return local;
    const { Preferences } = await import('@capacitor/preferences');
    const stored = await Preferences.get({ key: COUNTRY_KEY });
    const value = stored.value;
    const known = value ? countryByCode(value) : null;
    if (value === COUNTRY_NONE || known) {
      const normalized = known ? known.code : COUNTRY_NONE;
      try { storage.setItem(COUNTRY_KEY, normalized); } catch { /* ignore */ }
      return loadStoredCountry(storage);
    }
    if (local.chosen) {
      await Preferences.set({ key: COUNTRY_KEY, value: local.country ?? COUNTRY_NONE });
    }
  } catch {
    /* Preferences is absent in the browser and in tests. */
  }
  return loadStoredCountry(storage);
}
