import { Capacitor } from '@capacitor/core';
import { LAUNCH_COLLECTION_PRODUCT_ID } from '../config';
import { EMPTY_ENTITLEMENT } from '../entitlement';
import { KickoleBilling } from '../plugin';
import { STORE_UNAVAILABLE_MESSAGE } from '../storeCopy';
import type {
  BillingAdapter,
  BillingPlatform,
  EntitlementSnapshot,
  EntitlementSource,
  PurchaseOutcome,
  PurchaseResult,
  StoreProduct,
} from '../types';

const BILLING_CALL_TIMEOUT_MS = 20_000;
/** Backstop only. Play's payment sheet can stay open; connection failure returns from native much sooner. */
const PURCHASE_CALL_TIMEOUT_MS = 180_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('billing_timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

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
  private initPromise: Promise<void> | null = null;
  private onChange: ((e: EntitlementSnapshot) => void) | null = null;

  constructor(platform: 'ios' | 'android', onChange?: (e: EntitlementSnapshot) => void) {
    this.platform = platform;
    this.onChange = onChange ?? null;
  }

  setEntitlementListener(listener: ((snapshot: EntitlementSnapshot) => void) | null) {
    this.onChange = listener;
  }

  async init() {
    if (this.listener) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.attachListener().finally(() => {
      this.initPromise = null;
    });
    return this.initPromise;
  }

  private async attachListener() {
    this.listener = await withTimeout(
      KickoleBilling.addListener('entitlementChanged', (event) => {
        this.onChange?.(toEntitlement(event));
      }),
      BILLING_CALL_TIMEOUT_MS,
    );
  }

  async getLaunchProduct(): Promise<StoreProduct | null> {
    try {
      const product = await withTimeout(KickoleBilling.getLaunchProduct(), BILLING_CALL_TIMEOUT_MS);
      if (!product) return null;
      return {
        productId: product.productId || LAUNCH_COLLECTION_PRODUCT_ID,
        title: product.title,
        description: product.description,
        priceString: product.priceString,
        priceMicros: product.priceMicros,
        currencyCode: product.currencyCode,
      };
    } catch {
      return null;
    }
  }

  async purchaseLaunchCollection(): Promise<PurchaseResult> {
    if (this.busy) {
      return { outcome: 'busy', entitlement: EMPTY_ENTITLEMENT, message: 'Purchase already in progress.' };
    }
    this.busy = true;
    try {
      const raw = await withTimeout(KickoleBilling.purchaseLaunchCollection(), PURCHASE_CALL_TIMEOUT_MS);
      return {
        outcome: mapOutcome(raw.outcome),
        entitlement: toEntitlement(raw),
        message: raw.message,
      };
    } catch {
      return {
        outcome: 'failed',
        entitlement: EMPTY_ENTITLEMENT,
        message: STORE_UNAVAILABLE_MESSAGE,
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
      const raw = await withTimeout(KickoleBilling.restorePurchases(), BILLING_CALL_TIMEOUT_MS);
      return {
        outcome: mapOutcome(raw.outcome),
        entitlement: toEntitlement(raw),
        message: raw.message,
      };
    } catch {
      return {
        outcome: 'failed',
        entitlement: EMPTY_ENTITLEMENT,
        message: STORE_UNAVAILABLE_MESSAGE,
      };
    } finally {
      this.busy = false;
    }
  }

  async refreshEntitlements(): Promise<EntitlementSnapshot> {
    try {
      const raw = await withTimeout(KickoleBilling.refreshEntitlements(), BILLING_CALL_TIMEOUT_MS);
      return toEntitlement(raw);
    } catch {
      // Unknown, not "not owned". Callers must not revoke on this snapshot.
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
