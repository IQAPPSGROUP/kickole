export interface RunRecord {
  score: number;
  kickUps: number;
  date: number;
}

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  sound: boolean;
  vibration: boolean;
  quality: Quality;
  skinId: string;
}

export interface SaveData {
  best: number;
  leaderboard: RunRecord[];
}

const SAVE_KEY = 'kicky.save.v1';
const SETTINGS_KEY = 'kicky.settings.v1';

export const DEFAULT_SETTINGS: Settings = { sound: true, vibration: true, quality: 'high', skinId: 'kicky-teal' };

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
  const d = read<SaveData>(SAVE_KEY);
  const lb = Array.isArray(d?.leaderboard)
    ? d.leaderboard.filter((r) => r && typeof r.score === 'number' && typeof r.kickUps === 'number' && typeof r.date === 'number').slice(0, 5)
    : [];
  const best = typeof d?.best === 'number' ? d.best : 0;
  return { best: Math.max(best, ...lb.map((r) => r.score), 0), leaderboard: lb };
}

/** Records a run; returns the updated save plus whether it is a new personal best. */
export function saveRun(save: SaveData, run: RunRecord): { save: SaveData; newBest: boolean; rank: number } {
  const newBest = run.score > save.best;
  const all = [...save.leaderboard, run].sort((a, b) => b.score - a.score || b.date - a.date);
  const leaderboard = all.slice(0, 5);
  const rank = leaderboard.indexOf(run);
  const next = { best: Math.max(save.best, run.score), leaderboard };
  write(SAVE_KEY, next);
  return { save: next, newBest, rank };
}

export function loadSettings(): Settings {
  const d = read<Settings>(SETTINGS_KEY) ?? {};
  return {
    sound: typeof d.sound === 'boolean' ? d.sound : DEFAULT_SETTINGS.sound,
    vibration: typeof d.vibration === 'boolean' ? d.vibration : DEFAULT_SETTINGS.vibration,
    quality: d.quality === 'low' || d.quality === 'medium' || d.quality === 'high' ? d.quality : DEFAULT_SETTINGS.quality,
    skinId: typeof d.skinId === 'string' ? d.skinId : DEFAULT_SETTINGS.skinId,
  };
}

export function saveSettings(s: Settings) {
  write(SETTINGS_KEY, s);
}
