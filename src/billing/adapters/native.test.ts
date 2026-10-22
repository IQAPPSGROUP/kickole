import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_ENTITLEMENT } from '../entitlement';
import { STORE_UNAVAILABLE_MESSAGE } from '../storeCopy';

const addListener = vi.fn();
const getLaunchProduct = vi.fn();
const purchaseLaunchCollection = vi.fn();
const restorePurchases = vi.fn();
const refreshEntitlements = vi.fn();
const isSandboxReceipt = vi.fn();

vi.mock('../plugin', () => ({
  KickoleBilling: {
    addListener,
    getLaunchProduct,
    purchaseLaunchCollection,
    restorePurchases,
    refreshEntitlements,
    isSandboxReceipt,
  },
}));

describe('NativeBillingAdapter', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.resetModules();
    addListener.mockReset();
    addListener.mockResolvedValue({ remove: async () => {} });
    getLaunchProduct.mockReset();
    purchaseLaunchCollection.mockReset();
    restorePurchases.mockReset();
    refreshEntitlements.mockReset();
    isSandboxReceipt.mockReset();
    isSandboxReceipt.mockResolvedValue({ sandboxReceipt: true });
  });

  it('does not add a second listener when product load fails and init runs again', async () => {
    getLaunchProduct.mockRejectedValue(new Error('product_unavailable'));
    const { NativeBillingAdapter } = await import('./native');
    const adapter = new NativeBillingAdapter('ios');
    await adapter.init();
    await adapter.init();
    expect(addListener).toHaveBeenCalledTimes(1);
    await expect(adapter.getLaunchProduct()).resolves.toBeNull();
  });

  it('does not unlock Android when a receipt check would say sandbox', async () => {
    const { NativeBillingAdapter } = await import('./native');
    const android = new NativeBillingAdapter('android');
    await expect(android.isTestFlight()).resolves.toBe(false);
    expect(isSandboxReceipt).not.toHaveBeenCalled();
    const ios = new NativeBillingAdapter('ios');
    await expect(ios.isTestFlight()).resolves.toBe(true);
  });

  it('maps a failed entitlement refresh to an unknown snapshot', async () => {
    refreshEntitlements.mockRejectedValue(new Error('billing_query_failed'));
    const { NativeBillingAdapter } = await import('./native');
    const adapter = new NativeBillingAdapter('android');
    await expect(adapter.refreshEntitlements()).resolves.toEqual(EMPTY_ENTITLEMENT);
  });

  it('restore resolves with a visible error when billing does not answer', async () => {
    vi.useFakeTimers();
    restorePurchases.mockReturnValue(new Promise(() => {}));
    const { NativeBillingAdapter } = await import('./native');
    const adapter = new NativeBillingAdapter('android');
    const pending = adapter.restorePurchases();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toMatchObject({
      outcome: 'failed',
      message: STORE_UNAVAILABLE_MESSAGE,
    });
  });
});
