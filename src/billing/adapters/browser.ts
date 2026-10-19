import { LAUNCH_COLLECTION_DISPLAY_NAME, LAUNCH_COLLECTION_PRODUCT_ID } from '../config';
import { EMPTY_ENTITLEMENT } from '../entitlement';
import type { BillingAdapter, EntitlementSnapshot, PurchaseResult, StoreProduct } from '../types';

/**
 * Web / Cloudflare Pages adapter.
 * Development may simulate ownership only when explicitly opted in — never in production builds.
 */
export class BrowserBillingAdapter implements BillingAdapter {
  readonly platform = 'web' as const;
  private busy = false;

  async init() { /* no-op */ }

  async getLaunchProduct(): Promise<StoreProduct | null> {
    // Do not invent a localised price — there is no store catalogue on web.
    return null;
  }

  async purchaseLaunchCollection(): Promise<PurchaseResult> {
    if (import.meta.env.DEV && !import.meta.env.PROD && canDevSimulate()) {
      return this.devGrant('purchased');
    }
    return {
      outcome: 'unavailable',
      entitlement: EMPTY_ENTITLEMENT,
      message: `${LAUNCH_COLLECTION_DISPLAY_NAME} can be bought in the iOS App Store or Google Play app — not in the browser.`,
    };
  }

  async restorePurchases(): Promise<PurchaseResult> {
    if (import.meta.env.DEV && !import.meta.env.PROD && canDevSimulate()) {
      return this.devGrant('restored');
    }
    return {
      outcome: 'unavailable',
      entitlement: EMPTY_ENTITLEMENT,
      message: 'Restore is only available in the native apps. Apple and Google purchases stay on their own stores.',
    };
  }

  async refreshEntitlements(): Promise<EntitlementSnapshot> {
    // Never treat a localStorage boolean as payment proof on web.
    return EMPTY_ENTITLEMENT;
  }

  dispose() { /* no-op */ }

  private async devGrant(outcome: 'purchased' | 'restored'): Promise<PurchaseResult> {
    // Keep the grant body behind the development flag so `vite build` drops it.
    if (!import.meta.env.DEV || import.meta.env.PROD) {
      return {
        outcome: 'unavailable',
        entitlement: EMPTY_ENTITLEMENT,
        message: `${LAUNCH_COLLECTION_DISPLAY_NAME} can be bought in the iOS App Store or Google Play app — not in the browser.`,
      };
    }
    if (this.busy) {
      return { outcome: 'busy', entitlement: EMPTY_ENTITLEMENT, message: 'Purchase already in progress.' };
    }
    this.busy = true;
    try {
      const entitlement: EntitlementSnapshot = {
        owned: true,
        source: 'dev_sim',
        verifiedAt: Date.now(),
        transactionRef: `dev:${LAUNCH_COLLECTION_PRODUCT_ID}`,
      };
      return {
        outcome,
        entitlement,
        message: 'Development simulation only — not a real store purchase.',
      };
    } finally {
      this.busy = false;
    }
  }
}

function canDevSimulate(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('simPurchase') === '1';
  } catch {
    return false;
  }
}
