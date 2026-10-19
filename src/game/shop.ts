import { normalizeAppearance, type Appearance } from './appearance';
import {
  BOOTS,
  STARTER_BOOT_ID,
  STARTER_KIT_ID,
  getBoot,
  getKit,
  isBootId,
  isKitId,
  isLaunchCollectionId,
  LAUNCH_COLLECTION_ITEM_IDS,
  type ChallengeKind,
  type UnlockRequirement,
} from './catalogue';

export interface ChallengeProgress {
  alternateFoot: number;
  stalls: number;
  perfectTouch: number;
}

export interface WardrobeLocker {
  coins: number;
  ownedBoots: string[];
  equippedBoot: string;
  ownedKits: string[];
  equippedKit: string;
  appearance: Appearance;
  challenges: ChallengeProgress;
  /** True only after a successful Launch Collection purchase (billing not wired yet). */
  launchCollectionOwned: boolean;
  /** Save schema version for migrations. */
  wardrobeVersion: number;
}

export const WARDROBE_VERSION = 2;

export const EMPTY_CHALLENGES: ChallengeProgress = {
  alternateFoot: 0,
  stalls: 0,
  perfectTouch: 0,
};

/** One spendable coin per scored point. Empty runs award nothing. */
export function coinsForScore(score: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  return Math.floor(score);
}

export function challengeValue(progress: ChallengeProgress, kind: ChallengeKind): number {
  switch (kind) {
    case 'none': return 0;
    case 'alternateFoot': return progress.alternateFoot;
    case 'stall': return progress.stalls;
    case 'perfectTouch': return progress.perfectTouch;
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function meetsChallenge(progress: ChallengeProgress, unlock: UnlockRequirement): boolean {
  if (unlock.challenge === 'none') return true;
  return challengeValue(progress, unlock.challenge) >= unlock.challengeTarget;
}

export function canAfford(locker: WardrobeLocker, unlock: UnlockRequirement): boolean {
  return locker.coins >= unlock.price;
}

/**
 * Launch Collection: unlocks every launch-catalogue ID without spending coins.
 * Achievement badges / challenge tallies are unchanged. Future SKUs are excluded
 * because only LAUNCH_COLLECTION_ITEM_IDS are granted.
 */
export function applyLaunchCollection(locker: WardrobeLocker): WardrobeLocker {
  if (locker.launchCollectionOwned) return locker;
  const boots = new Set(locker.ownedBoots);
  const kits = new Set(locker.ownedKits);
  for (const id of LAUNCH_COLLECTION_ITEM_IDS) {
    if (isBootId(id)) boots.add(id);
    if (isKitId(id)) kits.add(id);
  }
  return {
    ...locker,
    launchCollectionOwned: true,
    ownedBoots: [...boots],
    ownedKits: [...kits],
  };
}

/** Real-money billing is not available yet — always refuse. */
export function purchaseLaunchCollection(_locker: WardrobeLocker): { ok: false; reason: 'billing_unavailable' } {
  return { ok: false, reason: 'billing_unavailable' };
}

export type ShopFailure = 'unknown' | 'broke' | 'locked' | 'billing_unavailable';

export type ShopResult =
  | { ok: true; locker: WardrobeLocker }
  | { ok: false; locker: WardrobeLocker; reason: ShopFailure };

export function buyOrEquipBoot(locker: WardrobeLocker, bootId: string): ShopResult {
  const boot = BOOTS.find((b) => b.id === bootId);
  if (!boot) return { ok: false, locker, reason: 'unknown' };
  if (locker.ownedBoots.includes(boot.id)) {
    return { ok: true, locker: { ...locker, equippedBoot: boot.id } };
  }
  if (!meetsChallenge(locker.challenges, boot.unlock)) {
    return { ok: false, locker, reason: 'locked' };
  }
  if (locker.coins < boot.unlock.price) return { ok: false, locker, reason: 'broke' };
  return {
    ok: true,
    locker: {
      ...locker,
      coins: locker.coins - boot.unlock.price,
      ownedBoots: [...locker.ownedBoots, boot.id],
      equippedBoot: boot.id,
    },
  };
}

export function buyOrEquipKit(locker: WardrobeLocker, kitId: string): ShopResult {
  if (!isKitId(kitId)) return { ok: false, locker, reason: 'unknown' };
  const kit = getKit(kitId);
  if (locker.ownedKits.includes(kit.id)) {
    return { ok: true, locker: { ...locker, equippedKit: kit.id } };
  }
  if (!meetsChallenge(locker.challenges, kit.unlock)) {
    return { ok: false, locker, reason: 'locked' };
  }
  if (locker.coins < kit.unlock.price) return { ok: false, locker, reason: 'broke' };
  return {
    ok: true,
    locker: {
      ...locker,
      coins: locker.coins - kit.unlock.price,
      ownedKits: [...locker.ownedKits, kit.id],
      equippedKit: kit.id,
    },
  };
}

/** Map legacy boot IDs from the 350/800/1600 shop onto the launch catalogue. */
const LEGACY_BOOT_MAP: Record<string, string> = {
  street: STARTER_BOOT_ID,
  samba: 'boot-beach-wave',
  carnival: 'boot-carnival',
  ole: 'boot-gold',
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
  coins?: unknown;
  ownedBoots?: unknown;
  equippedBoot?: unknown;
  ownedKits?: unknown;
  equippedKit?: unknown;
  appearance?: unknown;
  challenges?: unknown;
  launchCollectionOwned?: unknown;
  wardrobeVersion?: unknown;
  /** Legacy settings skin carried during migration. */
  legacySkinId?: string | null;
}

function mapBootId(id: string): string | null {
  if (isBootId(id)) return id;
  const mapped = LEGACY_BOOT_MAP[id];
  return mapped && isBootId(mapped) ? mapped : null;
}

export function normalizeLocker(raw: RawSaveFields | null | undefined): WardrobeLocker {
  const ownedBoots = Array.isArray(raw?.ownedBoots)
    ? [...new Set(raw.ownedBoots
      .filter((id): id is string => typeof id === 'string')
      .map(mapBootId)
      .filter((id): id is string => !!id))]
    : [];
  if (!ownedBoots.includes(STARTER_BOOT_ID)) ownedBoots.unshift(STARTER_BOOT_ID);

  let ownedKits = Array.isArray(raw?.ownedKits)
    ? [...new Set(raw.ownedKits.filter((id): id is string => typeof id === 'string' && isKitId(id)))]
    : [];

  // Migrate legacy free skins into owned kits (cosmetic only).
  const legacy = typeof raw?.legacySkinId === 'string' ? LEGACY_SKIN_MAP[raw.legacySkinId] : undefined;
  if (legacy && !ownedKits.includes(legacy.kit) && isKitId(legacy.kit)) {
    ownedKits = [...ownedKits, legacy.kit];
  }
  if (!ownedKits.includes(STARTER_KIT_ID)) ownedKits.unshift(STARTER_KIT_ID);

  const equippedBoot = typeof raw?.equippedBoot === 'string'
    ? (mapBootId(raw.equippedBoot) && ownedBoots.includes(mapBootId(raw.equippedBoot)!)
      ? mapBootId(raw.equippedBoot)!
      : STARTER_BOOT_ID)
    : STARTER_BOOT_ID;

  let equippedKit = typeof raw?.equippedKit === 'string' && ownedKits.includes(raw.equippedKit)
    ? raw.equippedKit
    : STARTER_KIT_ID;
  if (legacy && ownedKits.includes(legacy.kit) && !(typeof raw?.equippedKit === 'string')) {
    equippedKit = legacy.kit;
  }

  const coins = typeof raw?.coins === 'number' && Number.isFinite(raw.coins) && raw.coins > 0
    ? Math.floor(raw.coins)
    : 0;

  const ch = raw?.challenges as Partial<ChallengeProgress> | undefined;
  const challenges: ChallengeProgress = {
    alternateFoot: typeof ch?.alternateFoot === 'number' && ch.alternateFoot > 0 ? Math.floor(ch.alternateFoot) : 0,
    stalls: typeof ch?.stalls === 'number' && ch.stalls > 0 ? Math.floor(ch.stalls) : 0,
    perfectTouch: typeof ch?.perfectTouch === 'number' && ch.perfectTouch > 0 ? Math.floor(ch.perfectTouch) : 0,
  };

  let appearance = normalizeAppearance(raw?.appearance as Partial<Appearance> | undefined);
  if (legacy?.appearance) {
    appearance = normalizeAppearance({ ...appearance, ...legacy.appearance, clothing: { ...appearance.clothing, ...legacy.appearance.clothing } });
  }

  const launchCollectionOwned = raw?.launchCollectionOwned === true;
  let locker: WardrobeLocker = {
    coins,
    ownedBoots,
    equippedBoot: ownedBoots.includes(equippedBoot) ? equippedBoot : STARTER_BOOT_ID,
    ownedKits,
    equippedKit: ownedKits.includes(equippedKit) ? equippedKit : STARTER_KIT_ID,
    appearance,
    challenges,
    launchCollectionOwned: false,
    wardrobeVersion: WARDROBE_VERSION,
  };
  if (launchCollectionOwned) locker = applyLaunchCollection(locker);
  return locker;
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

export { getBoot, getKit, isLaunchCollectionId, STARTER_BOOT_ID, STARTER_KIT_ID };
