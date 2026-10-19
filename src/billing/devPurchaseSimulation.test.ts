import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeLocker } from '../game/shop';
import { BrowserBillingAdapter } from './adapters/browser';
import { PurchaseService } from './PurchaseService';

describe('development purchase simulation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('grants dev_sim only when ?simPurchase=1 is set on a development build', async () => {
    expect(import.meta.env.DEV).toBe(true);
    expect(import.meta.env.PROD).toBe(false);

    vi.stubGlobal('window', { location: { search: '' } });
    const blocked = await new BrowserBillingAdapter().purchaseLaunchCollection();
    expect(blocked.outcome).toBe('unavailable');
    expect(blocked.entitlement.owned).toBe(false);

    vi.stubGlobal('window', { location: { search: '?simPurchase=1' } });
    const adapter = new BrowserBillingAdapter();
    const purchased = await adapter.purchaseLaunchCollection();
    expect(purchased.outcome).toBe('purchased');
    expect(purchased.entitlement.source).toBe('dev_sim');
    expect(purchased.entitlement.owned).toBe(true);

    const service = new PurchaseService(adapter);
    const { locker } = await service.purchase(normalizeLocker(null));
    expect(locker.launchCollectionOwned).toBe(true);
    expect(locker.entitlementSource).toBe('dev_sim');
  });
});
