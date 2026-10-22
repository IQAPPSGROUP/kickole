import { Capacitor } from '@capacitor/core';
import { GAME_TRACKS, normalizeEnabledTracks, normalizeSongChoice, SHUFFLE_SONG, type GameTrackId, type SongChoice } from './tracks';
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
  /** 0..1 music level. The on/off switch is `music`. */
  musicVolume: number;
  /** 0..1 effects level. The on/off switch is `sfx`. */
  sfxVolume: number;
  /** Shuffle the gameplay playlist, or keep one track. Shuffle is the default. */
  song: SongChoice;
  /** Tracks left on in Settings. At least one stays on. */
  enabledSongs: GameTrackId[];
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
  musicVolume: 1,
  sfxVolume: 1,
  song: SHUFFLE_SONG,
  enabledSongs: GAME_TRACKS.map((track) => track.id),
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

/** Equipped ids as stored, before a locker normalise drops unowned costumes. */
export function peekEquippedCosmetics(): { outfit: string | null; boot: string | null } {
  const saved = read<{ equippedOutfit?: unknown; equippedBoot?: unknown }>(SAVE_KEY);
  return {
    outfit: typeof saved?.equippedOutfit === 'string' ? saved.equippedOutfit : null,
    boot: typeof saved?.equippedBoot === 'string' ? saved.equippedBoot : null,
  };
}

export function loadSave(): SaveData {
  const d = read<SaveData & { ownedBoots?: string[] }>(SAVE_KEY);
  const settings = read<Settings>(SETTINGS_KEY);
  const lb = Array.isArray(d?.leaderboard)
    ? d.leaderboard
      .filter((r) => r && typeof r.score === 'number' && typeof r.kickUps === 'number' && typeof r.date === 'number')
      .slice(0, 5)
    : [];
  const stated = typeof d?.best === 'number' && Number.isFinite(d.best) ? d.best : 0;
  const best = Math.max(0, stated, ...lb.map((r) => r.score));
  const storedVersion = typeof d?.wardrobeVersion === 'number' ? d.wardrobeVersion : 0;
  const locker = normalizeLocker({
    ...d,
    best,
    hadSave: d != null,
    legacySkinId: storedVersion < 2 && typeof settings?.skinId === 'string'
      ? settings.skinId
      : null,
  }, { trustStoreCache: trustNativeStoreCache() });
  const save: SaveData = {
    ...locker,
    best: locker.best,
    leaderboard: lb,
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
  bestStreak = 0,
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
    bestStreak: Math.max(save.bestStreak, Number.isFinite(bestStreak) ? Math.floor(bestStreak) : 0),
  };
  write(SAVE_KEY, next);
  return { save: next, newBest, rank, coinsEarned };
}

export function persistSave(save: SaveData) {
  write(SAVE_KEY, save);
}

function unitVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
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

function savedSong(value: unknown, enabled: readonly GameTrackId[]): SongChoice {
  const song = normalizeSongChoice(value);
  if (song !== SHUFFLE_SONG && !enabled.includes(song)) return SHUFFLE_SONG;
  return song;
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
    musicVolume: unitVolume(d.musicVolume),
    sfxVolume: unitVolume(d.sfxVolume),
    song: savedSong(d.song, normalizeEnabledTracks(d.enabledSongs)),
    enabledSongs: normalizeEnabledTracks(d.enabledSongs),
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
