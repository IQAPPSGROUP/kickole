import { LAUNCH_COLLECTION_ITEM_IDS, isBootId, isKitId } from '../game/catalogue';
import type { WardrobeLocker } from '../game/shop';
import type { EntitlementSnapshot, EntitlementSource } from './types';

export const EMPTY_ENTITLEMENT: EntitlementSnapshot = {
  owned: false,
  source: 'none',
  verifiedAt: 0,
  transactionRef: null,
};

/**
 * Grant launch-collection cosmetics from a verified store entitlement.
 * Records which item IDs were newly added so a later refund can remove only those.
 * Coin-purchased items and free customise stay untouched.
 */
export function grantLaunchCollection(
  locker: WardrobeLocker,
  source: Exclude<EntitlementSource, 'none'>,
  transactionRef: string | null,
  verifiedAt = Date.now(),
): WardrobeLocker {
  if (locker.launchCollectionOwned && locker.entitlementSource === source) {
    return {
      ...locker,
      entitlementVerifiedAt: verifiedAt,
      entitlementTransactionRef: transactionRef ?? locker.entitlementTransactionRef,
    };
  }

  const boots = new Set(locker.ownedBoots);
  const kits = new Set(locker.ownedKits);
  const newlyGranted: string[] = [...(locker.launchGrantedItemIds ?? [])];

  for (const id of LAUNCH_COLLECTION_ITEM_IDS) {
    if (isBootId(id)) {
      if (!boots.has(id)) {
        boots.add(id);
        if (!newlyGranted.includes(id)) newlyGranted.push(id);
      }
    } else if (isKitId(id)) {
      if (!kits.has(id)) {
        kits.add(id);
        if (!newlyGranted.includes(id)) newlyGranted.push(id);
      }
    }
  }

  return {
    ...locker,
    ownedBoots: [...boots],
    ownedKits: [...kits],
    launchCollectionOwned: true,
    launchGrantedItemIds: newlyGranted,
    entitlementSource: source,
    entitlementVerifiedAt: verifiedAt,
    entitlementTransactionRef: transactionRef,
  };
}

/**
 * Revoke paid launch access after refund/expiry without deleting coin-earned items.
 * Items in launchGrantedItemIds are removed only if they were not later bought with coins
 * (coin buy clears an id from launchGrantedItemIds — see shop.buyOrEquip*).
 */
export function revokeLaunchCollection(locker: WardrobeLocker): WardrobeLocker {
  if (!locker.launchCollectionOwned && !(locker.launchGrantedItemIds?.length)) {
    return {
      ...locker,
      launchCollectionOwned: false,
      entitlementSource: 'none',
      entitlementVerifiedAt: 0,
      entitlementTransactionRef: null,
      launchGrantedItemIds: [],
    };
  }

  const revoke = new Set(locker.launchGrantedItemIds ?? []);
  const ownedBoots = locker.ownedBoots.filter((id) => !revoke.has(id));
  const ownedKits = locker.ownedKits.filter((id) => !revoke.has(id));
  // Ensure starters remain.
  if (!ownedBoots.includes(locker.equippedBoot) || ownedBoots.length === 0) {
    /* starters forced in normalize */
  }

  let equippedBoot = locker.equippedBoot;
  let equippedKit = locker.equippedKit;
  if (!ownedBoots.includes(equippedBoot)) equippedBoot = ownedBoots[0] ?? locker.equippedBoot;
  if (!ownedKits.includes(equippedKit)) equippedKit = ownedKits[0] ?? locker.equippedKit;

  return {
    ...locker,
    ownedBoots,
    ownedKits,
    equippedBoot,
    equippedKit,
    launchCollectionOwned: false,
    launchGrantedItemIds: [],
    entitlementSource: 'none',
    entitlementVerifiedAt: 0,
    entitlementTransactionRef: null,
  };
}

/** When a player pays coins for an item, it is no longer revocable via launch refund. */
export function markCoinOwned(locker: WardrobeLocker, itemId: string): WardrobeLocker {
  const granted = (locker.launchGrantedItemIds ?? []).filter((id) => id !== itemId);
  return { ...locker, launchGrantedItemIds: granted };
}

export function entitlementFromLocker(locker: WardrobeLocker): EntitlementSnapshot {
  return {
    owned: locker.launchCollectionOwned === true,
    source: locker.entitlementSource ?? 'none',
    verifiedAt: locker.entitlementVerifiedAt ?? 0,
    transactionRef: locker.entitlementTransactionRef ?? null,
  };
}
