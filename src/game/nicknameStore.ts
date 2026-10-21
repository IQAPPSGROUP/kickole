import { checkNickname } from './nickname';

export const NICKNAME_KEY = 'kicky.nickname.v1';
export const DEVICE_ID_KEY = 'kicky.device.v1';

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
