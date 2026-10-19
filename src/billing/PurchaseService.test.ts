import { describe, expect, it } from 'vitest';
import { normalizeLocker } from '../game/shop';
import { PurchaseService } from './PurchaseService';
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
});
