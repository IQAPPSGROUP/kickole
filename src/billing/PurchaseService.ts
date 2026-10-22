import { Capacitor } from '@capacitor/core';
import type { WardrobeLocker } from '../game/shop';
import { BrowserBillingAdapter } from './adapters/browser';
import { NativeBillingAdapter, detectNativePlatform } from './adapters/native';
import { grantLaunchCollection, revokeLaunchCollection } from './entitlement';
import { SHOP_PACKS, shopPackForProduct } from '../game/outfits';
import { applyOwnedPackProducts, grantShopPack } from '../game/shop';
import type { BillingAdapter, BillingPlatform, EntitlementSnapshot, PackPurchaseResult, PurchaseResult, StoreProduct } from './types';

/** Ignore a not-owned event that races a grant which just landed. */
export function shouldIgnoreStaleRevoke(
  snapshot: EntitlementSnapshot,
  grantGuardUntil: number,
  now: number,
): boolean {
  return !snapshot.owned
    && (snapshot.source === 'apple' || snapshot.source === 'google')
    && now < grantGuardUntil;
}

/** Keep a grant if a refresh started around the same purchase still says not owned. */
export function shouldKeepRecentGrant(
  currentlyOwned: boolean,
  nextOwned: boolean,
  grantGuardUntil: number,
  now: number,
): boolean {
  return currentlyOwned && !nextOwned && now < grantGuardUntil;
}

const CLOSED_OUTCOMES = new Set<PurchaseResult['outcome']>([
  'pending',
  'cancelled',
  'failed',
  'unavailable',
  'busy',
]);

/**
 * Apply one store snapshot to a locker.
 * Revoke only on a definitive not-owned result from Apple or Google.
 * A thrown query, a `none` source, or a pending purchase keeps the cached grant.
 * Web never treats an apple/google flag as proof of purchase.
 */
export function applyEntitlementSnapshot(
  locker: WardrobeLocker,
  snapshot: EntitlementSnapshot,
  platform: BillingPlatform,
): WardrobeLocker {
  if (
    snapshot.owned
    && (snapshot.source === 'apple' || snapshot.source === 'google' || snapshot.source === 'dev_sim')
  ) {
    const source = snapshot.source;
    if (source === 'dev_sim' && import.meta.env.PROD) {
      return locker.entitlementSource === 'dev_sim' ? revokeLaunchCollection(locker) : locker;
    }
    if (platform === 'web' && source !== 'dev_sim') {
      if (locker.entitlementSource === 'apple' || locker.entitlementSource === 'google') {
        return revokeLaunchCollection(locker);
      }
      return locker;
    }
    return grantLaunchCollection(locker, source, snapshot.transactionRef, snapshot.verifiedAt || Date.now());
  }

  if (platform === 'web' && (locker.entitlementSource === 'apple' || locker.entitlementSource === 'google')) {
    return revokeLaunchCollection(locker);
  }
  if (locker.entitlementSource === 'dev_sim' && import.meta.env.PROD) {
    return revokeLaunchCollection(locker);
  }

  const definitiveNotOwned = !snapshot.owned && (snapshot.source === 'apple' || snapshot.source === 'google');
  if (platform !== 'web' && definitiveNotOwned) {
    return revokeLaunchCollection(locker);
  }
  return locker;
}

/**
 * Shared purchase facade used by the game UI.
 * Ownership changes only after adapter-reported store verification (or explicit DEV simulation).
 */
export class PurchaseService {
  private adapter: BillingAdapter;
  private product: StoreProduct | null = null;
  private packProducts: StoreProduct[] = [];
  private ready = false;
  private initPromise: Promise<void> | null = null;
  private entitlementListener: ((snapshot: EntitlementSnapshot) => void) | null = null;

  constructor(adapter?: BillingAdapter) {
    if (adapter) {
      this.adapter = adapter;
    } else {
      const native = detectNativePlatform();
      this.adapter = native
        ? new NativeBillingAdapter(native)
        : new BrowserBillingAdapter();
    }
  }

  get platform() {
    return this.adapter.platform;
  }

  get launchProduct() {
    return this.product;
  }

  get cosmeticProducts() {
    return this.packProducts;
  }

  setEntitlementListener(listener: ((snapshot: EntitlementSnapshot) => void) | null) {
    this.entitlementListener = listener;
  }

  applyStoreSnapshot(locker: WardrobeLocker, snapshot: EntitlementSnapshot): WardrobeLocker {
    return applyEntitlementSnapshot(locker, snapshot, this.adapter.platform);
  }

  async init() {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.start().finally(() => {
      if (!this.ready) this.initPromise = null;
    });
    return this.initPromise;
  }

  private async start() {
    await this.adapter.init();
    this.adapter.setEntitlementListener?.((snapshot) => {
      this.entitlementListener?.(snapshot);
    });
    try {
      this.product = await this.adapter.getLaunchProduct();
    } catch {
      this.product = null;
    }
    try {
      this.packProducts = await this.adapter.getProducts(SHOP_PACKS.map((pack) => pack.productId));
    } catch {
      this.packProducts = [];
    }
    this.ready = true;
  }

  async refreshProduct() {
    this.product = await this.adapter.getLaunchProduct();
    return this.product;
  }

  /**
   * Sync locker with the store. Retains previously verified access when the query fails
   * temporarily (network). Revokes when the store positively reports not owned.
   */
  async syncEntitlements(locker: WardrobeLocker): Promise<WardrobeLocker> {
    await this.init();
    let snapshot: EntitlementSnapshot;
    try {
      snapshot = await this.adapter.refreshEntitlements();
    } catch {
      return applyEntitlementSnapshot(
        locker,
        { owned: false, source: 'none', verifiedAt: 0, transactionRef: null },
        this.adapter.platform,
      );
    }
    return applyEntitlementSnapshot(locker, snapshot, this.adapter.platform);
  }

  async purchase(locker: WardrobeLocker): Promise<{ result: PurchaseResult; locker: WardrobeLocker }> {
    await this.init();
    const result = await this.adapter.purchaseLaunchCollection();
    return { result, locker: this.applyResult(locker, result) };
  }

  async purchasePack(
    locker: WardrobeLocker,
    productId: string,
  ): Promise<{ result: PackPurchaseResult; locker: WardrobeLocker }> {
    await this.init();
    const result = await this.adapter.purchaseProduct(productId);
    const pack = shopPackForProduct(result.productId);
    const granted = pack && (result.outcome === 'purchased' || result.outcome === 'restored' || result.outcome === 'already_owned')
      ? grantShopPack(locker, pack.id, result.source)
      : locker;
    return { result, locker: granted };
  }

  /**
   * Apply a successful native pack query. A thrown query leaves the locker as it was.
   * Web is ignored so a browser cannot wipe a hand-checked dev preview.
   */
  async syncPacks(locker: WardrobeLocker): Promise<WardrobeLocker> {
    await this.init();
    if (this.adapter.platform === 'web') return locker;
    try {
      const productIds = await this.adapter.ownedProductIds();
      const source = this.adapter.platform === 'ios' ? 'apple' : 'google';
      return applyOwnedPackProducts(locker, productIds, source);
    } catch {
      return locker;
    }
  }

  async restore(locker: WardrobeLocker): Promise<{ result: PurchaseResult; locker: WardrobeLocker }> {
    await this.init();
    const result = await this.adapter.restorePurchases();
    return { result, locker: this.applyResult(locker, result) };
  }

  private applyResult(locker: WardrobeLocker, result: PurchaseResult): WardrobeLocker {
    if (CLOSED_OUTCOMES.has(result.outcome)) return locker;
    return applyEntitlementSnapshot(locker, result.entitlement, this.adapter.platform);
  }

  dispose() {
    this.adapter.dispose();
  }
}

export function createDefaultPurchaseService() {
  return new PurchaseService();
}

export function isNativeRuntime() {
  return Capacitor.isNativePlatform();
}
