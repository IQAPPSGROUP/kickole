import { Capacitor } from '@capacitor/core';
import type { Appearance, PlayerBody } from './appearance';
import { normalizeAppearance } from './appearance';
import { normalizeLearned, type LessonId } from './prompts';
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

/** Auto follows the GPU. The other three are a saved choice. */
export type GraphicsChoice = 'auto' | Quality;

export interface Settings {
  /** Master mute. Music and effects also have their own switches. */
  sound: boolean;
  /** Menu and gameplay music. */
  music: boolean;
  /** Kicks, cheers and the crowd bed. */
  sfx: boolean;
  vibration: boolean;
  /** On-screen trick prompts, glowing controls and tutorial tips. */
  hints: boolean;
  /** Saved graphics choice. Auto lets the device pick the tier. */
  graphics: GraphicsChoice;
  /** Explicit tier. Kept in step with graphics when the player picks Low, Medium, or High. */
  quality: Quality;
  /** @deprecated Prefer wardrobe kit + appearance; kept for migration. */
  skinId: string;
}

export interface SaveData extends WardrobeLocker {
  best: number;
  leaderboard: RunRecord[];
  /** Trick lessons the player has already been taught. */
  learnedTricks: LessonId[];
}

const SAVE_KEY = 'kicky.save.v1';
const SETTINGS_KEY = 'kicky.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  sound: true,
  music: true,
  sfx: true,
  vibration: true,
  hints: true,
  graphics: 'auto',
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
    hadSave: d != null,
    legacySkinId: storedVersion < 2 && typeof settings?.skinId === 'string'
      ? settings.skinId
      : null,
  }, { trustStoreCache: trustNativeStoreCache() });
  const save: SaveData = {
    best: Math.max(best, ...lb.map((r) => r.score), 0),
    leaderboard: lb,
    ...locker,
    learnedTricks: normalizeLearned(d?.learnedTricks),
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

function isQuality(value: unknown): value is Quality {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isGraphics(value: unknown): value is GraphicsChoice {
  return value === 'auto' || isQuality(value);
}

/**
 * Missing graphics means an older save. Low and Medium were explicit choices.
 * High was the old default, so it becomes Auto and the device decides.
 */
export function graphicsFromSaved(raw: { graphics?: unknown; quality?: unknown }): GraphicsChoice {
  if (isGraphics(raw.graphics)) return raw.graphics;
  if (raw.quality === 'low' || raw.quality === 'medium') return raw.quality;
  return 'auto';
}

/** Keep the saved choice and the legacy quality field pointing at the same tier. */
export function applyGraphicsPatch(current: Settings, patch: Partial<Settings>): Settings {
  const next: Settings = { ...current, ...patch };
  if (patch.graphics && patch.graphics !== 'auto') next.quality = patch.graphics;
  else if (patch.quality && patch.graphics === undefined) next.graphics = patch.quality;
  return next;
}

export function loadSettings(): Settings {
  const d = read<Settings>(SETTINGS_KEY) ?? {};
  const graphics = graphicsFromSaved(d);
  return {
    sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
    music: typeof d.music === 'boolean' ? d.music : DEFAULT_SETTINGS.music,
    sfx: typeof d.sfx === 'boolean' ? d.sfx : DEFAULT_SETTINGS.sfx,
    vibration: typeof d.vibration === 'boolean' ? d.vibration : DEFAULT_SETTINGS.vibration,
    hints: typeof d.hints === 'boolean' ? d.hints : DEFAULT_SETTINGS.hints,
    graphics,
    quality: graphics !== 'auto' ? graphics : (isQuality(d.quality) ? d.quality : DEFAULT_SETTINGS.quality),
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

/** Persist a free male/female choice and dismiss the first-launch picker. */
export function choosePlayerBody(save: SaveData, body: PlayerBody): SaveData {
  const next: SaveData = {
    ...save,
    bodyChosen: true,
    appearance: normalizeAppearance({ ...save.appearance, body }),
  };
  write(SAVE_KEY, next);
  return next;
}

export type { Appearance, ChallengeProgress, WardrobeLocker };
