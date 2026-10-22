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
import {
  COWBOY_BOOT_ID,
  GOLD_LEGEND_STREAK,
  cosmeticGrantAllowed,
  earnedOutfit,
  getOutfit,
  getShopPack,
  isOutfitId,
  isShopPackId,
  keepStoreCosmetic,
  milestoneMet,
  packsGrantedBy,
  shopPackForProduct,
  type OutfitId,
  type ShopPackId,
} from './outfits';
import {
  STARTER_DANCE_ID,
  equipDance,
  normalizeDances,
  type DanceId,
  type DanceLocker,
} from './dances';

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
  /**
   * False only until the first-launch picker writes a choice.
   * Saves from before the picker migrate to true and stay on the male footballer.
   */
  bodyChosen: boolean;
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
  /** Lifetime milestone rank that unlocks cosmetic dances. */
  danceRank: number;
  ownedDances: DanceId[];
  equippedDance: DanceId;
  /** Lifetime best combo. Gold Legend unlocks from this, not from a purchase. */
  bestStreak: number;
  /** Themed outfits granted by the store. Gold Legend is not stored here. */
  ownedOutfits: OutfitId[];
  /** Null wears the equipped kit. */
  equippedOutfit: OutfitId | null;
  /** Source of ownedOutfits, ownedPacks and the cowboy boot. dev_sim is never accepted. */
  cosmeticSource: EntitlementSource;
  /** Non-consumable packs granted by the store. Everything also lists the four packs. */
  ownedPacks: ShopPackId[];
  /** Save schema version for migrations. */
  wardrobeVersion: number;
}

/** v3 adds the free male/female body. Legacy kit seeds stay on versions older than 2. */
export const WARDROBE_VERSION = 3;
const LEGACY_SKIN_VERSION = 2;

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
  // Development helper only. Production / TestFlight bundles must not grant dev_sim.
  if (import.meta.env.PROD) return locker;
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
  if (boot.id === COWBOY_BOOT_ID || boot.storeProductId) return { ok: false, locker, reason: 'billing_unavailable' };
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
  danceRank?: unknown;
  ownedDances?: unknown;
  equippedDance?: unknown;
  bestStreak?: unknown;
  ownedOutfits?: unknown;
  equippedOutfit?: unknown;
  ownedPacks?: unknown;
  cosmeticSource?: unknown;
  wardrobeVersion?: unknown;
  bodyChosen?: unknown;
  /** Set by loadSave when a save object already existed. Not written back. */
  hadSave?: boolean;
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

  // Legacy skin seeds run once, while the save is still older than schema 2.
  const legacy = storedVersion < LEGACY_SKIN_VERSION && typeof raw?.legacySkinId === 'string'
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

  let danceRank = typeof raw?.danceRank === 'number' && Number.isFinite(raw.danceRank)
    ? raw.danceRank
    : undefined;
  if (danceRank === undefined && storedVersion < WARDROBE_VERSION) {
    danceRank = seedDanceRank(challenges);
  }

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
  const dances = normalizeDances({
    danceRank,
    ownedDances: raw?.ownedDances,
    equippedDance: raw?.equippedDance,
  });
  const bestStreak = typeof raw?.bestStreak === 'number' && Number.isFinite(raw.bestStreak) && raw.bestStreak > 0
    ? Math.floor(raw.bestStreak)
    : 0;
  const cosmeticSource = parseEntitlementSource(raw?.cosmeticSource);
  const keepCosmetic = keepStoreCosmetic(cosmeticSource, options?.trustStoreCache === true, import.meta.env.PROD);
  const ownedOutfits = keepCosmetic && Array.isArray(raw?.ownedOutfits)
    ? raw.ownedOutfits.filter((id): id is OutfitId => typeof id === 'string' && isOutfitId(id) && !earnedOutfit(id))
    : [];
  const ownedPacks = keepCosmetic && Array.isArray(raw?.ownedPacks)
    ? raw.ownedPacks.filter((id): id is ShopPackId => typeof id === 'string' && isShopPackId(id))
    : [];
  const milestoneStats = {
    stalls: challenges.stalls,
    alternateFoot: challenges.alternateFoot,
    perfectTouch: challenges.perfectTouch,
    bestStreak,
  };
  const equippedCandidate = getOutfit(typeof raw?.equippedOutfit === 'string' ? raw.equippedOutfit : null);
  const equippedOutfit = equippedCandidate && (
    equippedCandidate.milestone
      ? milestoneMet(milestoneStats, equippedCandidate.milestone)
      : ownedOutfits.includes(equippedCandidate.id)
  )
    ? equippedCandidate.id
    : null;

  // A bare boolean is not proof. On web, apple/google strings are not proof either.
  // Native builds may keep that cache and re-check it with the store.
  const trustStoreCache = options?.trustStoreCache === true;
  const cachedOwned = raw?.launchCollectionOwned === true && (
    entitlementSource === 'dev_sim'
    || (trustStoreCache && (entitlementSource === 'apple' || entitlementSource === 'google'))
  );

  const bodyChosen = raw?.bodyChosen === true
    ? true
    : raw?.bodyChosen === false
      ? false
      : raw?.hadSave === true || storedVersion > 0;

  const visibleBoots = keepCosmetic ? ownedBoots : ownedBoots.filter((id) => id !== COWBOY_BOOT_ID);
  let locker: WardrobeLocker = {
    coins,
    ownedBoots: visibleBoots,
    equippedBoot: visibleBoots.includes(equippedBoot) ? equippedBoot : STARTER_BOOT_ID,
    ownedKits,
    equippedKit: ownedKits.includes(equippedKit) ? equippedKit : STARTER_KIT_ID,
    appearance,
    bodyChosen,
    challenges,
    launchCollectionOwned: false,
    launchGrantedItemIds: [],
    entitlementSource: 'none',
    entitlementVerifiedAt: 0,
    entitlementTransactionRef: null,
    danceRank: dances.danceRank,
    ownedDances: dances.ownedDances,
    equippedDance: dances.equippedDance,
    bestStreak,
    ownedOutfits,
    equippedOutfit,
    cosmeticSource: keepCosmetic ? cosmeticSource : 'none',
    ownedPacks,
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

export function milestoneStatsOf(locker: WardrobeLocker) {
  return {
    stalls: locker.challenges.stalls,
    alternateFoot: locker.challenges.alternateFoot,
    perfectTouch: locker.challenges.perfectTouch,
    bestStreak: locker.bestStreak,
  };
}

export function outfitOwned(locker: WardrobeLocker, id: string): boolean {
  const outfit = getOutfit(id);
  if (!outfit) return false;
  if (outfit.milestone) return milestoneMet(milestoneStatsOf(locker), outfit.milestone);
  return locker.ownedOutfits.includes(outfit.id);
}

export function packOwned(locker: WardrobeLocker, id: ShopPackId): boolean {
  if (locker.ownedPacks.includes(id)) return true;
  if (id === 'everything') return CONTENT_PACKS_OWNED(locker);
  return false;
}

function CONTENT_PACKS_OWNED(locker: WardrobeLocker): boolean {
  return locker.ownedPacks.includes('heroes-space')
    && locker.ownedPacks.includes('adventure')
    && locker.ownedPacks.includes('party')
    && locker.ownedPacks.includes('spooky');
}

/** Equip a themed outfit the player already unlocked, or clear it with null. */
export function equipOutfit(locker: WardrobeLocker, id: string | null): ShopResult {
  if (id === null) return { ok: true, locker: { ...locker, equippedOutfit: null } };
  if (!outfitOwned(locker, id)) return { ok: false, locker, reason: 'locked' };
  const outfit = getOutfit(id);
  if (!outfit) return { ok: false, locker, reason: 'unknown' };
  return { ok: true, locker: { ...locker, equippedOutfit: outfit.id } };
}

/**
 * Record a store grant for one themed outfit or the cowboy boots.
 * dev_sim is refused. Launch Collection purchases do not call this.
 */
export function grantStoreCosmetic(
  locker: WardrobeLocker,
  id: string,
  source: EntitlementSource,
): WardrobeLocker {
  if (!cosmeticGrantAllowed(source)) return locker;
  if (id === COWBOY_BOOT_ID) {
    const ownedBoots = locker.ownedBoots.includes(COWBOY_BOOT_ID)
      ? locker.ownedBoots
      : [...locker.ownedBoots, COWBOY_BOOT_ID];
    return { ...locker, ownedBoots, cosmeticSource: source };
  }
  if (!isOutfitId(id) || earnedOutfit(id)) return locker;
  const ownedOutfits = locker.ownedOutfits.includes(id) ? locker.ownedOutfits : [...locker.ownedOutfits, id];
  return { ...locker, ownedOutfits, cosmeticSource: source };
}

/**
 * Replace pack ownership with what the store currently entitles.
 * Call only after a successful native query. Web must not call this with an empty list.
 */
export function applyOwnedPackProducts(
  locker: WardrobeLocker,
  productIds: readonly string[],
  source: EntitlementSource,
): WardrobeLocker {
  if (!cosmeticGrantAllowed(source)) return locker;
  const equipped = locker.equippedOutfit;
  let next: WardrobeLocker = {
    ...locker,
    ownedPacks: [],
    ownedOutfits: [],
    ownedBoots: locker.ownedBoots.filter((id) => id !== COWBOY_BOOT_ID),
    equippedBoot: locker.equippedBoot === COWBOY_BOOT_ID ? STARTER_BOOT_ID : locker.equippedBoot,
    cosmeticSource: 'none',
  };
  for (const productId of productIds) {
    const pack = shopPackForProduct(productId);
    if (pack) next = grantShopPack(next, pack.id, source);
  }
  if (equipped && outfitOwned(next, equipped)) next = { ...next, equippedOutfit: equipped };
  else if (equipped) next = { ...next, equippedOutfit: null };
  return next;
}

/** Grant every look in a non-consumable pack. Everything also grants the other four. */
export function grantShopPack(
  locker: WardrobeLocker,
  packId: string,
  source: EntitlementSource,
): WardrobeLocker {
  if (!cosmeticGrantAllowed(source) || !isShopPackId(packId)) return locker;
  let next = locker;
  for (const id of packsGrantedBy(packId)) {
    const pack = getShopPack(id);
    if (!pack || next.ownedPacks.includes(id)) continue;
    for (const outfitId of pack.outfitIds) next = grantStoreCosmetic(next, outfitId, source);
    for (const bootId of pack.bootIds) next = grantStoreCosmetic(next, bootId, source);
    next = { ...next, ownedPacks: next.ownedPacks.includes(id) ? next.ownedPacks : [...next.ownedPacks, id], cosmeticSource: source };
  }
  return next;
}

/** Development-only dress-up. Production builds leave the locker unchanged. */
export function rememberDevCosmetic(locker: WardrobeLocker, id: string | null): WardrobeLocker {
  if (import.meta.env.PROD) return locker;
  if (id === null) return { ...locker, equippedOutfit: null };
  if (id === COWBOY_BOOT_ID) {
    const ownedBoots = locker.ownedBoots.includes(id) ? locker.ownedBoots : [...locker.ownedBoots, id];
    return { ...locker, ownedBoots, equippedBoot: id, cosmeticSource: 'none' };
  }
  if (!isOutfitId(id)) return locker;
  if (id === 'gold-legend') {
    return { ...locker, bestStreak: Math.max(locker.bestStreak, GOLD_LEGEND_STREAK), equippedOutfit: id };
  }
  const ownedOutfits = locker.ownedOutfits.includes(id) ? locker.ownedOutfits : [...locker.ownedOutfits, id];
  return { ...locker, ownedOutfits, equippedOutfit: id, cosmeticSource: 'none' };
}

/** Equip a dance the player already unlocked. Dances are not coin purchases. */
export function equipOwnedDance(locker: WardrobeLocker, id: string): ShopResult {
  const result = equipDance(locker, id);
  if (!result.ok) return { ok: false, locker, reason: 'locked' };
  return { ok: true, locker: { ...locker, ...result.locker } };
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

export { getBoot, getKit, isLaunchCollectionId, STARTER_BOOT_ID, STARTER_KIT_ID, STARTER_DANCE_ID, COWBOY_BOOT_ID, GOLD_LEGEND_STREAK };
export type { DanceId, DanceLocker };
