import { countryByCode } from './countries';
import { checkNickname } from './nickname';

export const NICKNAME_KEY = 'kicky.nickname.v1';
export const DEVICE_ID_KEY = 'kicky.device.v1';
export const COUNTRY_KEY = 'kicky.country.v1';
export const OPT_IN_KEY = 'kicky.board.optin.v1';

export type BoardOptIn = 'unknown' | 'in' | 'out';

/** Stored when the player chooses International. Missing key means they have not chosen yet. */
const COUNTRY_NONE = 'none';

export interface StoredCountry {
  /** True after a save, including International. */
  chosen: boolean;
  /** ISO alpha-2, or null when unset or International. */
  country: string | null;
}

export function loadBoardOptIn(storage: Storage = localStorage): BoardOptIn {
  try {
    const raw = storage.getItem(OPT_IN_KEY);
    if (raw === 'in' || raw === 'out') return raw;
  } catch {
    /* missing means they have not been asked */
  }
  return 'unknown';
}

export function saveBoardOptIn(value: Exclude<BoardOptIn, 'unknown'>, storage: Storage = localStorage): void {
  try {
    storage.setItem(OPT_IN_KEY, value);
  } catch {
    /* the in-memory choice still applies this session */
  }
  void mirrorPreference(OPT_IN_KEY, value);
}

export async function hydrateBoardOptIn(storage: Storage = localStorage): Promise<BoardOptIn> {
  const local = loadBoardOptIn(storage);
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return local;
    const { Preferences } = await import('@capacitor/preferences');
    const stored = await Preferences.get({ key: OPT_IN_KEY });
    if (stored.value === 'in' || stored.value === 'out') {
      try { storage.setItem(OPT_IN_KEY, stored.value); } catch { /* ignore */ }
      return stored.value;
    }
    if (local !== 'unknown') await Preferences.set({ key: OPT_IN_KEY, value: local });
  } catch {
    /* Preferences is absent in the browser and in tests. */
  }
  return loadBoardOptIn(storage);
}

/** Forget the nickname, country and install id. The next loadDeviceId mints a new id. */
export async function resetLeaderboardIdentity(storage: Storage = localStorage): Promise<string> {
  for (const key of [
    NICKNAME_KEY,
    COUNTRY_KEY,
    DEVICE_ID_KEY,
    'kicky.board.blocks.v1',
    'kicky.board.reports.v1',
    'kicky.board.best.v1',
    'kicky.board.outbox.v1',
    'kicky.board.pending-moderation.v1',
  ]) {
    try { storage.removeItem(key); } catch { /* ignore */ }
  }
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Preferences } = await import('@capacitor/preferences');
      await Preferences.remove({ key: NICKNAME_KEY });
      await Preferences.remove({ key: COUNTRY_KEY });
      await Preferences.remove({ key: DEVICE_ID_KEY });
    }
  } catch {
    /* Web storage already dropped the keys. */
  }
  return loadDeviceId(storage);
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

const DEVICE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mintDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  const sixth = bytes[6] ?? 0;
  const eighth = bytes[8] ?? 0;
  bytes[6] = (sixth & 0x0f) | 0x40;
  bytes[8] = (eighth & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Random id for this install. It is not shown and is not the player's name. */
export function loadDeviceId(storage: Storage = localStorage): string {
  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing && DEVICE_UUID.test(existing)) {
      void mirrorPreference(DEVICE_ID_KEY, existing);
      return existing;
    }
  } catch {
    /* fall through and mint one */
  }
  const id = mintDeviceId();
  try {
    storage.setItem(DEVICE_ID_KEY, id);
  } catch {
    /* keep the in-memory id for this session */
  }
  void mirrorPreference(DEVICE_ID_KEY, id);
  return id;
}

/**
 * On a phone, Capacitor Preferences keeps the same install id if WebView
 * storage is cleared. The browser keeps using localStorage.
 */
export async function hydrateDeviceId(storage: Storage = localStorage): Promise<string> {
  const local = loadDeviceId(storage);
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return local;
    const { Preferences } = await import('@capacitor/preferences');
    const stored = await Preferences.get({ key: DEVICE_ID_KEY });
    if (stored.value && DEVICE_UUID.test(stored.value)) {
      try { storage.setItem(DEVICE_ID_KEY, stored.value); } catch { /* ignore */ }
      return stored.value;
    }
    await Preferences.set({ key: DEVICE_ID_KEY, value: local });
  } catch {
    /* Preferences is absent in the browser and in tests. */
  }
  return loadDeviceId(storage);
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

/** `null` stores International. A locale guess is not written until the player saves. */
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
