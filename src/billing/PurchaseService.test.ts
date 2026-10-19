import { describe, expect, it } from 'vitest';
import { normalizeLocker } from '../game/shop';
import { grantLaunchCollection } from './entitlement';
import { PurchaseService, shouldIgnoreStaleRevoke, shouldKeepRecentGrant } from './PurchaseService';
import type { BillingAdapter, EntitlementSnapshot, PurchaseResult, StoreProduct } from './types';

class FakeAdapter implements BillingAdapter {
  platform: 'web' | 'ios' | 'android' = 'ios';
  owned = false;
  product: StoreProduct | null = {
    productId: 'kickole_launch_collection',
    title: 'Kickolé Launch Collection',
    description: 'All launch boots and kits',
    priceString: '£2.99',
    priceMicros: 2_990_000,
    currencyCode: 'GBP',
  };
  lastOutcome: PurchaseResult['outcome'] = 'purchased';
  failRefresh = false;
  refreshSnapshot: EntitlementSnapshot | null = null;
  private listener: ((snapshot: EntitlementSnapshot) => void) | null = null;

  setEntitlementListener(listener: ((snapshot: EntitlementSnapshot) => void) | null) {
    this.listener = listener;
  }

  emit(snapshot: EntitlementSnapshot) {
    this.listener?.(snapshot);
  }

  async init() {}
  async getLaunchProduct() { return this.product; }
  async purchaseLaunchCollection(): Promise<PurchaseResult> {
    if (this.lastOutcome === 'pending') {
      return { outcome: 'pending', entitlement: empty(), message: 'pending' };
    }
    if (this.lastOutcome === 'cancelled') {
      return { outcome: 'cancelled', entitlement: empty(), message: 'cancelled' };
    }
    this.owned = true;
    return {
      outcome: this.lastOutcome,
      entitlement: { owned: true, source: 'apple', verifiedAt: 100, transactionRef: 'apple:abc' },
    };
  }
  async restorePurchases(): Promise<PurchaseResult> {
    return {
      outcome: 'restored',
      entitlement: {
        owned: this.owned,
        source: this.owned ? 'apple' : 'none',
        verifiedAt: 100,
        transactionRef: this.owned ? 'apple:abc' : null,
      },
    };
  }
  async refreshEntitlements(): Promise<EntitlementSnapshot> {
    if (this.failRefresh) throw new Error('billing_unavailable');
    if (this.refreshSnapshot) return this.refreshSnapshot;
    return {
      owned: this.owned,
      source: this.owned ? 'apple' : 'apple',
      verifiedAt: 200,
      transactionRef: this.owned ? 'apple:abc' : null,
    };
  }
  dispose() {}
}

function empty(): EntitlementSnapshot {
  return { owned: false, source: 'none', verifiedAt: 0, transactionRef: null };
}

describe('PurchaseService', () => {
  it('loads the store localised price string without hardcoding', async () => {
    const adapter = new FakeAdapter();
    const service = new PurchaseService(adapter);
    await service.init();
    expect(service.launchProduct?.priceString).toBe('£2.99');
    expect(service.launchProduct?.currencyCode).toBe('GBP');
  });

  it('grants launch items only after a verified purchase', async () => {
    const adapter = new FakeAdapter();
    const service = new PurchaseService(adapter);
    const start = normalizeLocker(null);
    const { result, locker } = await service.purchase(start);
    expect(result.outcome).toBe('purchased');
    expect(locker.launchCollectionOwned).toBe(true);
    expect(locker.ownedBoots.length).toBeGreaterThan(1);
    expect(locker.entitlementSource).toBe('apple');
  });

  it('does not unlock content for pending purchases', async () => {
    const adapter = new FakeAdapter();
    adapter.lastOutcome = 'pending';
    const service = new PurchaseService(adapter);
    const start = normalizeLocker(null);
    const { locker } = await service.purchase(start);
    expect(locker.launchCollectionOwned).toBe(false);
    expect(locker.ownedBoots).toEqual(start.ownedBoots);
  });

  it('does not unlock on cancelled purchases', async () => {
    const adapter = new FakeAdapter();
    adapter.lastOutcome = 'cancelled';
    const service = new PurchaseService(adapter);
    const { locker } = await service.purchase(normalizeLocker(null));
    expect(locker.launchCollectionOwned).toBe(false);
  });

  it('revokes launch grant when the store reports not owned', async () => {
    const adapter = new FakeAdapter();
    const service = new PurchaseService(adapter);
    const owned = (await service.purchase(normalizeLocker(null))).locker;
    expect(owned.launchCollectionOwned).toBe(true);
    adapter.owned = false;
    const synced = await service.syncEntitlements(owned);
    expect(synced.launchCollectionOwned).toBe(false);
    expect(synced.ownedBoots).toEqual(['boot-street-classic']);
  });

  it('keeps an owned collection when the store query fails', async () => {
    const adapter = new FakeAdapter();
    adapter.platform = 'android';
    const service = new PurchaseService(adapter);
    const owned = (await service.purchase(normalizeLocker(null))).locker;
    expect(owned.ownedBoots.length).toBeGreaterThan(1);
    adapter.failRefresh = true;
    const synced = await service.syncEntitlements(owned);
    expect(synced.launchCollectionOwned).toBe(true);
    expect(synced.ownedBoots).toEqual(owned.ownedBoots);
    expect(synced.entitlementSource).toBe('apple');
  });

  it('keeps an owned collection when the snapshot is not a definitive store result', async () => {
    const adapter = new FakeAdapter();
    adapter.platform = 'android';
    const service = new PurchaseService(adapter);
    const owned = (await service.purchase(normalizeLocker(null))).locker;
    adapter.refreshSnapshot = { owned: false, source: 'none', verifiedAt: Date.now(), transactionRef: null };
    const synced = await service.syncEntitlements(owned);
    expect(synced.launchCollectionOwned).toBe(true);
    expect(synced.ownedBoots).toEqual(owned.ownedBoots);
  });

  it('does not keep a hand-edited apple entitlement on web', async () => {
    const adapter = new FakeAdapter();
    adapter.platform = 'web';
    const service = new PurchaseService(adapter);
    const forged = grantLaunchCollection(normalizeLocker(null), 'apple', 'apple:forged', 10);
    adapter.refreshSnapshot = { owned: false, source: 'none', verifiedAt: 0, transactionRef: null };
    const synced = await service.syncEntitlements(forged);
    expect(synced.launchCollectionOwned).toBe(false);
    expect(synced.entitlementSource).toBe('none');
    expect(synced.ownedBoots).toEqual(['boot-street-classic']);
  });

  it('grants when the store reports the item is already owned', async () => {
    const adapter = new FakeAdapter();
    adapter.lastOutcome = 'already_owned';
    const service = new PurchaseService(adapter);
    const { result, locker } = await service.purchase(normalizeLocker(null));
    expect(result.outcome).toBe('already_owned');
    expect(locker.launchCollectionOwned).toBe(true);
  });

  it('applies a refund reported while the app is running', async () => {
    const adapter = new FakeAdapter();
    const service = new PurchaseService(adapter);
    let locker = (await service.purchase(normalizeLocker(null))).locker;
    service.setEntitlementListener((snapshot) => {
      locker = service.applyStoreSnapshot(locker, snapshot);
    });
    await service.init();
    adapter.emit({ owned: false, source: 'apple', verifiedAt: 9, transactionRef: null });
    expect(locker.launchCollectionOwned).toBe(false);
    expect(locker.ownedBoots).toEqual(['boot-street-classic']);
  });

  it('ignores a not-owned event that races a grant', () => {
    const revoke = { owned: false, source: 'apple' as const, verifiedAt: 20, transactionRef: null };
    expect(shouldIgnoreStaleRevoke(revoke, 1_000, 500)).toBe(true);
    expect(shouldIgnoreStaleRevoke(revoke, 1_000, 1_000)).toBe(false);
    expect(shouldKeepRecentGrant(true, false, 1_000, 500)).toBe(true);
    expect(shouldKeepRecentGrant(true, false, 1_000, 1_500)).toBe(false);
    expect(shouldKeepRecentGrant(false, false, 1_000, 500)).toBe(false);
    expect(shouldIgnoreStaleRevoke(
      { owned: false, source: 'none', verifiedAt: 20, transactionRef: null },
      1_000,
      500,
    )).toBe(false);
  });

  it('does not revoke when a live update is only a connection failure', async () => {
    const adapter = new FakeAdapter();
    const service = new PurchaseService(adapter);
    let locker = (await service.purchase(normalizeLocker(null))).locker;
    service.setEntitlementListener((snapshot) => {
      locker = service.applyStoreSnapshot(locker, snapshot);
    });
    await service.init();
    adapter.emit({ owned: false, source: 'none', verifiedAt: Date.now(), transactionRef: null });
    expect(locker.launchCollectionOwned).toBe(true);
    expect(locker.ownedBoots.length).toBeGreaterThan(1);
  });
});
