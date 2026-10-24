/**
 * Eight plain boot styles. Earned by play, stored on this device, never sold.
 * Goals are fixed and shown before they are earned. Nothing here is random.
 */

export const CLASSIC_BOOT_ID = 'boot-classic';

export const BOOT_STYLE_IDS = [
  CLASSIC_BOOT_ID,
  'boot-wellies',
  'boot-cowboy',
  'boot-hitops',
  'boot-snow',
  'boot-space',
  'boot-knight',
  'boot-gold',
] as const;

export type BootStyleId = (typeof BOOT_STYLE_IDS)[number];

export interface BootStyle {
  id: BootStyleId;
  name: string;
  /** Shown on a locked pair. Classic says Starter. */
  hint: string;
  main: string;
  dark: string;
  light: string;
}

/** Graham's sheet. Locked cards use BOOT_LOCKED, not these colours. */
export const BOOT_STYLES: readonly BootStyle[] = [
  { id: 'boot-classic', name: 'Classic', hint: 'Starter', main: '#2B2B2B', dark: '#4A4A4A', light: '#8A8A8A' },
  { id: 'boot-wellies', name: 'Wellies', hint: '100 kick-ups in total', main: '#2E8B3E', dark: '#1A5A26', light: '#4FB060' },
  { id: 'boot-cowboy', name: 'Cowboy', hint: 'Land your first Rainbow', main: '#8B5A2B', dark: '#5A3415', light: '#E0B070' },
  { id: 'boot-hitops', name: 'Hi-tops', hint: '5 different tricks in one run', main: '#D62828', dark: '#F2F2F2', light: '#FFFFFF' },
  { id: 'boot-snow', name: 'Snow boots', hint: 'Beat your best score 3 times', main: '#2F6FB0', dark: '#1E3F66', light: '#F4F1EA' },
  { id: 'boot-space', name: 'Space boots', hint: 'Hit a x5 combo', main: '#F2F2F2', dark: '#8A9096', light: '#C9CED3' },
  { id: 'boot-knight', name: 'Knight', hint: '1,000 kick-ups in total', main: '#9AA3AB', dark: '#5E666E', light: '#D5DBE0' },
  { id: 'boot-gold', name: 'Gold', hint: '2,500 kick-ups in total', main: '#D4A62A', dark: '#8A6A14', light: '#FFF0A8' },
];

/** Grey used on a locked pair. Not a ninth style. */
export const BOOT_LOCKED = '#6E7A73';

export interface BootProgress {
  /** Accepted kicks, lifetime. */
  kickUps: number;
  /** Landed rainbows (around the world). */
  rainbows: number;
  /** Most distinct scored tricks in any single run. */
  bestTricksInRun: number;
  /** Times a finished run beat an existing best. The first score does not count. */
  bestBeats: number;
  /** A clean five-touch combo has landed. Scoring still tops out at x4. */
  combo5: boolean;
}

export const EMPTY_BOOT_PROGRESS: BootProgress = {
  kickUps: 0,
  rainbows: 0,
  bestTricksInRun: 0,
  bestBeats: 0,
  combo5: false,
};

export interface BootPlayDelta {
  kickUps?: number;
  rainbow?: boolean;
  tricksInRun?: number;
  beatBest?: boolean;
  combo5?: boolean;
}

export function isBootStyleId(id: string): id is BootStyleId {
  return (BOOT_STYLE_IDS as readonly string[]).includes(id);
}

export function getBootStyle(id: string): BootStyle {
  return BOOT_STYLES.find((style) => style.id === id) ?? BOOT_STYLES[0];
}

function count(value: unknown, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(max, Math.floor(value));
}

/** Progress from a v5 save. Older saves start again at Classic. */
export function bootProgressFromSave(raw: unknown, wardrobeVersion: number): BootProgress {
  if (wardrobeVersion < 5 || !raw || typeof raw !== 'object') return { ...EMPTY_BOOT_PROGRESS };
  const row = raw as Partial<BootProgress>;
  return {
    kickUps: count(row.kickUps, 1_000_000),
    rainbows: count(row.rainbows, 1_000_000),
    bestTricksInRun: count(row.bestTricksInRun, 6),
    bestBeats: count(row.bestBeats, 1_000_000),
    combo5: row.combo5 === true,
  };
}

export function bootEarned(id: BootStyleId, progress: BootProgress): boolean {
  switch (id) {
    case 'boot-classic':
      return true;
    case 'boot-wellies':
      return progress.kickUps >= 100;
    case 'boot-cowboy':
      return progress.rainbows >= 1;
    case 'boot-hitops':
      return progress.bestTricksInRun >= 5;
    case 'boot-snow':
      return progress.bestBeats >= 3;
    case 'boot-space':
      return progress.combo5;
    case 'boot-knight':
      return progress.kickUps >= 1000;
    case 'boot-gold':
      return progress.kickUps >= 2500;
    default: {
      const unexpected: never = id;
      return unexpected;
    }
  }
}

export function earnedBootIds(progress: BootProgress): BootStyleId[] {
  return BOOT_STYLES.filter((style) => bootEarned(style.id, progress)).map((style) => style.id);
}

export function noteBootPlay(
  progress: BootProgress,
  delta: BootPlayDelta,
): { progress: BootProgress; unlocked: BootStyleId[]; changed: boolean } {
  const before = new Set(earnedBootIds(progress));
  const next: BootProgress = {
    kickUps: progress.kickUps + Math.max(0, Math.floor(delta.kickUps ?? 0)),
    rainbows: progress.rainbows + (delta.rainbow ? 1 : 0),
    bestTricksInRun: Math.max(progress.bestTricksInRun, Math.max(0, Math.floor(delta.tricksInRun ?? 0))),
    bestBeats: progress.bestBeats + (delta.beatBest ? 1 : 0),
    combo5: progress.combo5 || delta.combo5 === true,
  };
  const changed = next.kickUps !== progress.kickUps
    || next.rainbows !== progress.rainbows
    || next.bestTricksInRun !== progress.bestTricksInRun
    || next.bestBeats !== progress.bestBeats
    || next.combo5 !== progress.combo5;
  const unlocked = earnedBootIds(next).filter((id) => !before.has(id));
  return { progress: next, unlocked, changed };
}
