import { normalizeAppearance, type Appearance } from './appearance';
import {
  STARTER_BOOT_ID,
  STARTER_KIT_ID,
  isKitId,
} from './catalogue';
import {
  bootProgressFromSave,
  earnedBootIds,
  type BootProgress,
} from './bootStyles';
import {
  STARTER_DANCE_ID,
  normalizeDances,
  type DanceId,
  type DanceLocker,
} from './dances';

export interface ChallengeProgress {
  alternateFoot: number;
  stalls: number;
  perfectTouch: number;
}

/** On-device look. Kits and boot styles are free. Nothing here is bought. */
export interface WardrobeLocker {
  /** Styles the play goals have earned. Derived from bootProgress. */
  ownedBoots: string[];
  equippedBoot: string;
  /** Lifetime boot goals. Stays on this device. */
  bootProgress: BootProgress;
  ownedKits: string[];
  equippedKit: string;
  appearance: Appearance;
  /**
   * False only until the first-launch picker writes a choice.
   * Saves from before the picker migrate to true and stay on the male footballer.
   */
  bodyChosen: boolean;
  challenges: ChallengeProgress;
  /** Lifetime milestone rank that unlocks cosmetic dances. */
  danceRank: number;
  ownedDances: DanceId[];
  equippedDance: DanceId;
  /** Lifetime best combo. Dance ranks use this. */
  bestStreak: number;
  /** Highest score from a single run. */
  best: number;
  /** Save schema version for migrations. */
  wardrobeVersion: number;
}

/** v5 replaces the old boot catalogue with styles earned by play. */
export const WARDROBE_VERSION = 5;
const LEGACY_SKIN_VERSION = 2;

export const EMPTY_CHALLENGES: ChallengeProgress = {
  alternateFoot: 0,
  stalls: 0,
  perfectTouch: 0,
};

/** Map legacy settings skin IDs onto launch kits + free appearance seeds. */
const LEGACY_SKIN_MAP: Record<string, { kit: string; appearance?: Partial<Appearance> }> = {
  'kicky-teal': { kit: STARTER_KIT_ID },
  'coral-flash': {
    kit: 'kit-carnival',
    appearance: {
      skinTone: '#8D5A3C',
      hairColor: '#16100E',
      clothing: { shirt: '#FF805D', shirtTrim: '#F7F5ED', shorts: '#142D35', socks: '#FF805D' },
    },
  },
  'lime-night': {
    kit: 'kit-midnight',
    appearance: {
      skinTone: '#F2CDAA',
      hairColor: '#C9822B',
      clothing: { shirt: '#EAF44A', shirtTrim: '#142D35', shorts: '#142D35', socks: '#EAF44A' },
    },
  },
};

export interface RawSaveFields {
  ownedBoots?: unknown;
  equippedBoot?: unknown;
  bootProgress?: unknown;
  ownedKits?: unknown;
  equippedKit?: unknown;
  appearance?: unknown;
  challenges?: unknown;
  danceRank?: unknown;
  ownedDances?: unknown;
  equippedDance?: unknown;
  bestStreak?: unknown;
  best?: unknown;
  wardrobeVersion?: unknown;
  bodyChosen?: unknown;
  /** Set by loadSave when a save object already existed. Not written back. */
  hadSave?: boolean;
  /** Legacy settings skin carried during migration. */
  legacySkinId?: string | null;
}

export function normalizeLocker(raw: RawSaveFields | null | undefined): WardrobeLocker {
  const storedVersion = typeof raw?.wardrobeVersion === 'number' && Number.isFinite(raw.wardrobeVersion)
    ? Math.floor(raw.wardrobeVersion)
    : 0;
  const bootProgress = bootProgressFromSave(raw?.bootProgress, storedVersion);
  const ownedBoots = earnedBootIds(bootProgress);

  let ownedKits = Array.isArray(raw?.ownedKits)
    ? [...new Set(raw.ownedKits.filter((id): id is string => typeof id === 'string' && isKitId(id)))]
    : [];

  // Legacy skin seeds run once, while the save is still older than schema 2.
  const legacy = storedVersion < LEGACY_SKIN_VERSION && typeof raw?.legacySkinId === 'string'
    ? LEGACY_SKIN_MAP[raw.legacySkinId]
    : undefined;
  if (legacy && !ownedKits.includes(legacy.kit) && isKitId(legacy.kit)) {
    ownedKits = [...ownedKits, legacy.kit];
  }
  if (!ownedKits.includes(STARTER_KIT_ID)) ownedKits.unshift(STARTER_KIT_ID);

  const equippedBoot = storedVersion >= 5
    && typeof raw?.equippedBoot === 'string'
    && (ownedBoots as readonly string[]).includes(raw.equippedBoot)
    ? raw.equippedBoot
    : STARTER_BOOT_ID;

  let equippedKit = typeof raw?.equippedKit === 'string' && ownedKits.includes(raw.equippedKit)
    ? raw.equippedKit
    : STARTER_KIT_ID;
  if (legacy && ownedKits.includes(legacy.kit) && !(typeof raw?.equippedKit === 'string')) {
    equippedKit = legacy.kit;
  }

  const ch = raw?.challenges as Partial<ChallengeProgress> | undefined;
  const challenges: ChallengeProgress = {
    alternateFoot: typeof ch?.alternateFoot === 'number' && ch.alternateFoot > 0 ? Math.floor(ch.alternateFoot) : 0,
    stalls: typeof ch?.stalls === 'number' && ch.stalls > 0 ? Math.floor(ch.stalls) : 0,
    perfectTouch: typeof ch?.perfectTouch === 'number' && ch.perfectTouch > 0 ? Math.floor(ch.perfectTouch) : 0,
  };

  let danceRank = typeof raw?.danceRank === 'number' && Number.isFinite(raw.danceRank)
    ? raw.danceRank
    : undefined;
  if (danceRank === undefined && storedVersion < WARDROBE_VERSION) {
    danceRank = seedDanceRank(challenges);
  }

  let appearance = normalizeAppearance(raw?.appearance as Partial<Appearance> | undefined);
  if (legacy?.appearance) {
    appearance = normalizeAppearance({
      ...legacy.appearance,
      body: appearance.body,
      clothing: { ...appearance.clothing, ...legacy.appearance.clothing },
    });
  }

  const dances = normalizeDances({
    danceRank,
    ownedDances: raw?.ownedDances,
    equippedDance: raw?.equippedDance,
  });
  const bestStreak = typeof raw?.bestStreak === 'number' && Number.isFinite(raw.bestStreak) && raw.bestStreak > 0
    ? Math.floor(raw.bestStreak)
    : 0;
  const best = typeof raw?.best === 'number' && Number.isFinite(raw.best) && raw.best > 0
    ? Math.floor(raw.best)
    : 0;

  const bodyChosen = raw?.bodyChosen === true
    ? true
    : raw?.bodyChosen === false
      ? false
      : raw?.hadSave === true || storedVersion > 0;

  return {
    ownedBoots,
    equippedBoot,
    bootProgress,
    ownedKits,
    equippedKit,
    appearance,
    bodyChosen,
    challenges,
    danceRank: dances.danceRank,
    ownedDances: dances.ownedDances,
    equippedDance: dances.equippedDance,
    bestStreak,
    best,
    wardrobeVersion: WARDROBE_VERSION,
  };
}

/** Challenge progress from saves that predate the dance locker. */
function seedDanceRank(progress: ChallengeProgress): number {
  if (progress.perfectTouch >= 80) return 50;
  if (progress.perfectTouch >= 25) return 25;
  if (progress.stalls >= 25 || progress.alternateFoot >= 40) return 10;
  return 0;
}

export function bumpChallenges(
  progress: ChallengeProgress,
  delta: Partial<ChallengeProgress>,
): ChallengeProgress {
  return {
    alternateFoot: progress.alternateFoot + Math.max(0, Math.floor(delta.alternateFoot ?? 0)),
    stalls: progress.stalls + Math.max(0, Math.floor(delta.stalls ?? 0)),
    perfectTouch: progress.perfectTouch + Math.max(0, Math.floor(delta.perfectTouch ?? 0)),
  };
}

export { STARTER_BOOT_ID, STARTER_KIT_ID, STARTER_DANCE_ID };
export type { DanceId, DanceLocker };
