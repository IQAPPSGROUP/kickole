import { Capacitor } from '@capacitor/core';
import type { WardrobeLocker } from '../game/shop';
import { BrowserBillingAdapter } from './adapters/browser';
import { NativeBillingAdapter, detectNativePlatform } from './adapters/native';
import { grantLaunchCollection, revokeLaunchCollection } from './entitlement';
import type { BillingAdapter, EntitlementSnapshot, PurchaseResult, StoreProduct } from './types';

/**
 * Shared purchase facade used by the game UI.
 * Ownership changes only after adapter-reported store verification (or explicit DEV simulation).
 */
export class PurchaseService {
  private adapter: BillingAdapter;
  private product: StoreProduct | null = null;
  private ready = false;

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

  async init() {
    if (this.ready) return;
    await this.adapter.init();
    this.product = await this.adapter.getLaunchProduct();
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
      // Keep trusted offline cache for apple/google only.
      if (
        locker.launchCollectionOwned
        && (locker.entitlementSource === 'apple' || locker.entitlementSource === 'google')
        && locker.entitlementVerifiedAt > 0
      ) {
        return locker;
      }
      return locker;
    }

    if (snapshot.owned && (snapshot.source === 'apple' || snapshot.source === 'google' || snapshot.source === 'dev_sim')) {
      if (snapshot.source === 'dev_sim' && import.meta.env.PROD) return locker;
      return grantLaunchCollection(locker, snapshot.source, snapshot.transactionRef, snapshot.verifiedAt);
    }

    // Positive "not owned" from a native store → revoke launch grant only.
    if (this.adapter.platform !== 'web' && snapshot.source !== 'none') {
      return revokeLaunchCollection(locker);
    }
    if (this.adapter.platform !== 'web' && !snapshot.owned && snapshot.verifiedAt > 0) {
      return revokeLaunchCollection(locker);
    }
    return locker;
  }

  async purchase(locker: WardrobeLocker): Promise<{ result: PurchaseResult; locker: WardrobeLocker }> {
    await this.init();
    const result = await this.adapter.purchaseLaunchCollection();
    return { result, locker: this.applyResult(locker, result) };
  }

  async restore(locker: WardrobeLocker): Promise<{ result: PurchaseResult; locker: WardrobeLocker }> {
    await this.init();
    const result = await this.adapter.restorePurchases();
    return { result, locker: this.applyResult(locker, result) };
  }

  private applyResult(locker: WardrobeLocker, result: PurchaseResult): WardrobeLocker {
    if (result.outcome === 'pending') {
      // Do not unlock for pending / Ask to Buy / incomplete Play purchases.
      return locker;
    }
    if (
      (result.outcome === 'purchased' || result.outcome === 'restored' || result.outcome === 'already_owned')
      && result.entitlement.owned
      && (result.entitlement.source === 'apple'
        || result.entitlement.source === 'google'
        || result.entitlement.source === 'dev_sim')
    ) {
      if (result.entitlement.source === 'dev_sim' && import.meta.env.PROD) return locker;
      return grantLaunchCollection(
        locker,
        result.entitlement.source,
        result.entitlement.transactionRef,
        result.entitlement.verifiedAt || Date.now(),
      );
    }
    return locker;
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
