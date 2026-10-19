import { Capacitor } from '@capacitor/core';
import { LAUNCH_COLLECTION_PRODUCT_ID } from '../config';
import { EMPTY_ENTITLEMENT } from '../entitlement';
import { KickoleBilling } from '../plugin';
import type {
  BillingAdapter,
  BillingPlatform,
  EntitlementSnapshot,
  EntitlementSource,
  PurchaseOutcome,
  PurchaseResult,
  StoreProduct,
} from '../types';

function mapSource(raw: string | undefined): EntitlementSource {
  if (raw === 'apple' || raw === 'google') return raw;
  return 'none';
}

function mapOutcome(raw: string | undefined): PurchaseOutcome {
  switch (raw) {
    case 'purchased':
    case 'restored':
    case 'cancelled':
    case 'pending':
    case 'failed':
    case 'unavailable':
    case 'already_owned':
    case 'busy':
      return raw;
    default:
      return 'failed';
  }
}

function toEntitlement(raw: {
  owned: boolean;
  source: string;
  verifiedAt: number;
  transactionRef: string | null;
}): EntitlementSnapshot {
  return {
    owned: !!raw.owned,
    source: mapSource(raw.source),
    verifiedAt: typeof raw.verifiedAt === 'number' ? raw.verifiedAt : 0,
    transactionRef: raw.transactionRef ?? null,
  };
}

export class NativeBillingAdapter implements BillingAdapter {
  readonly platform: BillingPlatform;
  private busy = false;
  private listener: { remove: () => Promise<void> } | null = null;
  private onChange: ((e: EntitlementSnapshot) => void) | null = null;

  constructor(platform: 'ios' | 'android', onChange?: (e: EntitlementSnapshot) => void) {
    this.platform = platform;
    this.onChange = onChange ?? null;
  }

  async init() {
    this.listener = await KickoleBilling.addListener('entitlementChanged', (event) => {
      this.onChange?.(toEntitlement(event));
    });
  }

  async getLaunchProduct(): Promise<StoreProduct | null> {
    const product = await KickoleBilling.getLaunchProduct();
    if (!product) return null;
    return {
      productId: product.productId || LAUNCH_COLLECTION_PRODUCT_ID,
      title: product.title,
      description: product.description,
      priceString: product.priceString,
      priceMicros: product.priceMicros,
      currencyCode: product.currencyCode,
    };
  }

  async purchaseLaunchCollection(): Promise<PurchaseResult> {
    if (this.busy) {
      return { outcome: 'busy', entitlement: EMPTY_ENTITLEMENT, message: 'Purchase already in progress.' };
    }
    this.busy = true;
    try {
      const raw = await KickoleBilling.purchaseLaunchCollection();
      return {
        outcome: mapOutcome(raw.outcome),
        entitlement: toEntitlement(raw),
        message: raw.message,
      };
    } catch {
      return {
        outcome: 'failed',
        entitlement: EMPTY_ENTITLEMENT,
        message: 'Purchase could not be completed. No charge was confirmed.',
      };
    } finally {
      this.busy = false;
    }
  }

  async restorePurchases(): Promise<PurchaseResult> {
    if (this.busy) {
      return { outcome: 'busy', entitlement: EMPTY_ENTITLEMENT, message: 'Please wait.' };
    }
    this.busy = true;
    try {
      const raw = await KickoleBilling.restorePurchases();
      return {
        outcome: mapOutcome(raw.outcome),
        entitlement: toEntitlement(raw),
        message: raw.message,
      };
    } catch {
      return {
        outcome: 'failed',
        entitlement: EMPTY_ENTITLEMENT,
        message: 'Could not restore purchases right now. Try again when you are online.',
      };
    } finally {
      this.busy = false;
    }
  }

  async refreshEntitlements(): Promise<EntitlementSnapshot> {
    try {
      const raw = await KickoleBilling.refreshEntitlements();
      return toEntitlement(raw);
    } catch {
      return EMPTY_ENTITLEMENT;
    }
  }

  dispose() {
    void this.listener?.remove();
    this.listener = null;
  }
}

export function detectNativePlatform(): 'ios' | 'android' | null {
  const p = Capacitor.getPlatform();
  if (p === 'ios' || p === 'android') return p;
  return null;
}
