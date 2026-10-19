import type { EntitlementSource } from '../billing/types';
import { grantLaunchCollection, markCoinOwned } from '../billing/entitlement';
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
  /**
   * Cache of paid Launch Collection ownership. Never treat this alone as proof of payment
   * on web — native adapters re-verify with the store. See docs/BILLING.md.
   */
  launchCollectionOwned: boolean;
  /** Item IDs granted by the paid collection that can be revoked on refund (not coin-bought). */
  launchGrantedItemIds: string[];
  entitlementSource: EntitlementSource;
  entitlementVerifiedAt: number;
  entitlementTransactionRef: string | null;
  /** Save schema version for migrations. */
  wardrobeVersion: number;
}

export const WARDROBE_VERSION = 2;

export interface NormalizeLockerOptions {
  /**
   * Native builds may trust an apple/google cache until the store answers.
   * Web must not: a hand-edited source string is not a receipt.
   */
  trustStoreCache?: boolean;
}

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

/** @deprecated Prefer grantLaunchCollection from billing/entitlement after store verification. */
export function applyLaunchCollection(locker: WardrobeLocker): WardrobeLocker {
  return grantLaunchCollection(locker, 'dev_sim', null);
}

export type ShopFailure = 'unknown' | 'broke' | 'locked' | 'billing_unavailable' | 'pending';

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
  const next = markCoinOwned({
    ...locker,
    coins: locker.coins - boot.unlock.price,
    ownedBoots: [...locker.ownedBoots, boot.id],
    equippedBoot: boot.id,
  }, boot.id);
  return { ok: true, locker: next };
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
  const next = markCoinOwned({
    ...locker,
    coins: locker.coins - kit.unlock.price,
    ownedKits: [...locker.ownedKits, kit.id],
    equippedKit: kit.id,
  }, kit.id);
  return { ok: true, locker: next };
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
  launchGrantedItemIds?: unknown;
  entitlementSource?: unknown;
  entitlementVerifiedAt?: unknown;
  entitlementTransactionRef?: unknown;
  wardrobeVersion?: unknown;
  /** Legacy settings skin carried during migration. */
  legacySkinId?: string | null;
}

function parseEntitlementSource(raw: unknown): EntitlementSource {
  if (raw === 'apple' || raw === 'google' || raw === 'dev_sim' || raw === 'none') return raw;
  return 'none';
}

function mapBootId(id: string): string | null {
  if (isBootId(id)) return id;
  const mapped = LEGACY_BOOT_MAP[id];
  return mapped && isBootId(mapped) ? mapped : null;
}

export function normalizeLocker(
  raw: RawSaveFields | null | undefined,
  options?: NormalizeLockerOptions,
): WardrobeLocker {
  const storedVersion = typeof raw?.wardrobeVersion === 'number' && Number.isFinite(raw.wardrobeVersion)
    ? Math.floor(raw.wardrobeVersion)
    : 0;
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

  // Legacy skin seeds run once, while the save is still older than the wardrobe schema.
  const legacy = storedVersion < WARDROBE_VERSION && typeof raw?.legacySkinId === 'string'
    ? LEGACY_SKIN_MAP[raw.legacySkinId]
    : undefined;
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

  const entitlementSource = parseEntitlementSource(raw?.entitlementSource);
  const entitlementVerifiedAt = typeof raw?.entitlementVerifiedAt === 'number' && raw.entitlementVerifiedAt > 0
    ? Math.floor(raw.entitlementVerifiedAt)
    : 0;
  const entitlementTransactionRef = typeof raw?.entitlementTransactionRef === 'string'
    ? raw.entitlementTransactionRef
    : null;
  const launchGrantedItemIds = Array.isArray(raw?.launchGrantedItemIds)
    ? raw.launchGrantedItemIds.filter((id): id is string => typeof id === 'string')
    : [];

  // A bare boolean is not proof. On web, apple/google strings are not proof either.
  // Native builds may keep that cache and re-check it with the store.
  const trustStoreCache = options?.trustStoreCache === true;
  const cachedOwned = raw?.launchCollectionOwned === true && (
    entitlementSource === 'dev_sim'
    || (trustStoreCache && (entitlementSource === 'apple' || entitlementSource === 'google'))
  );

  let locker: WardrobeLocker = {
    coins,
    ownedBoots,
    equippedBoot: ownedBoots.includes(equippedBoot) ? equippedBoot : STARTER_BOOT_ID,
    ownedKits,
    equippedKit: ownedKits.includes(equippedKit) ? equippedKit : STARTER_KIT_ID,
    appearance,
    challenges,
    launchCollectionOwned: false,
    launchGrantedItemIds: [],
    entitlementSource: 'none',
    entitlementVerifiedAt: 0,
    entitlementTransactionRef: null,
    wardrobeVersion: WARDROBE_VERSION,
  };

  if (cachedOwned) {
    // In production web builds, ignore dev_sim caches.
    if (entitlementSource === 'dev_sim' && import.meta.env.PROD) {
      return locker;
    }
    locker = grantLaunchCollection(
      { ...locker, launchGrantedItemIds },
      entitlementSource as 'apple' | 'google' | 'dev_sim',
      entitlementTransactionRef,
      entitlementVerifiedAt || Date.now(),
    );
  }
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
