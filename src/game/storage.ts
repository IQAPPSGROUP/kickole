import { Capacitor } from '@capacitor/core';
import type { Appearance } from './appearance';
import { normalizeAppearance } from './appearance';
import {
  bumpChallenges,
  coinsForScore,
  normalizeLocker,
  type ChallengeProgress,
  type WardrobeLocker,
  WARDROBE_VERSION,
} from './shop';

export interface RunRecord {
  score: number;
  kickUps: number;
  date: number;
}

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  /** Master mute. Music and effects also have their own switches. */
  sound: boolean;
  /** Menu and gameplay music. */
  music: boolean;
  /** Kicks, cheers and the crowd bed. */
  sfx: boolean;
  vibration: boolean;
  quality: Quality;
  /** @deprecated Prefer wardrobe kit + appearance; kept for migration. */
  skinId: string;
}

export interface SaveData extends WardrobeLocker {
  best: number;
  leaderboard: RunRecord[];
}

const SAVE_KEY = 'kicky.save.v1';
const SETTINGS_KEY = 'kicky.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  sfx: true,
  vibration: true,
  quality: 'high',
  skinId: 'kicky-teal',
};

function trustNativeStoreCache(): boolean {
  try {
    const platform = Capacitor.getPlatform();
    return platform === 'ios' || platform === 'android';
  } catch {
    return false;
  }
}

function read<T>(key: string): Partial<T> | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode / quota): keep playing without persistence */
  }
}

export function loadSave(): SaveData {
  const d = read<SaveData & { ownedBoots?: string[] }>(SAVE_KEY);
  const settings = read<Settings>(SETTINGS_KEY);
  const lb = Array.isArray(d?.leaderboard)
    ? d.leaderboard
      .filter((r) => r && typeof r.score === 'number' && typeof r.kickUps === 'number' && typeof r.date === 'number')
      .slice(0, 5)
    : [];
  const best = typeof d?.best === 'number' ? d.best : 0;
  const storedVersion = typeof d?.wardrobeVersion === 'number' ? d.wardrobeVersion : 0;
  const locker = normalizeLocker({
    ...d,
    legacySkinId: storedVersion < WARDROBE_VERSION && typeof settings?.skinId === 'string'
      ? settings.skinId
      : null,
  }, { trustStoreCache: trustNativeStoreCache() });
  const save: SaveData = {
    best: Math.max(best, ...lb.map((r) => r.score), 0),
    leaderboard: lb,
    ...locker,
  };
  // Persist migrated shape when an older save existed (keep empty installs unwritten).
  if (d && (d as { wardrobeVersion?: number }).wardrobeVersion !== WARDROBE_VERSION) {
    write(SAVE_KEY, save);
  }
  return save;
}

/** Records a run; awards coins and lifetime challenge tallies from the run result. */
export function saveRun(
  save: SaveData,
  run: RunRecord,
  challengeDelta: Partial<ChallengeProgress> = {},
): { save: SaveData; newBest: boolean; rank: number; coinsEarned: number } {
  const newBest = run.score > save.best;
  const all = [...save.leaderboard, run].sort((a, b) => b.score - a.score || b.date - a.date);
  const leaderboard = all.slice(0, 5);
  const rank = leaderboard.indexOf(run);
  const coinsEarned = coinsForScore(run.score);
  const next: SaveData = {
    ...save,
    best: Math.max(save.best, run.score),
    leaderboard,
    coins: save.coins + coinsEarned,
    challenges: bumpChallenges(save.challenges, challengeDelta),
  };
  write(SAVE_KEY, next);
  return { save: next, newBest, rank, coinsEarned };
}

export function persistSave(save: SaveData) {
  write(SAVE_KEY, save);
}

export function loadSettings(): Settings {
  const d = read<Settings>(SETTINGS_KEY) ?? {};
  return {
    sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
    music: typeof d.music === 'boolean' ? d.music : DEFAULT_SETTINGS.music,
    sfx: typeof d.sfx === 'boolean' ? d.sfx : DEFAULT_SETTINGS.sfx,
    vibration: typeof d.vibration === 'boolean' ? d.vibration : DEFAULT_SETTINGS.vibration,
    quality: d.quality === 'low' || d.quality === 'medium' || d.quality === 'high' ? d.quality : DEFAULT_SETTINGS.quality,
    skinId: typeof d.skinId === 'string' ? d.skinId : DEFAULT_SETTINGS.skinId,
  };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}

export function updateAppearance(save: SaveData, appearance: Appearance): SaveData {
  const next: SaveData = { ...save, appearance: normalizeAppearance(appearance) };
  write(SAVE_KEY, next);
  return next;
}

export type { Appearance, ChallengeProgress, WardrobeLocker };
