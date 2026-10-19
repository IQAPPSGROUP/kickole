export type BillingPlatform = 'ios' | 'android' | 'web';

export type EntitlementSource = 'none' | 'apple' | 'google' | 'dev_sim';

export type PurchaseOutcome =
  | 'purchased'
  | 'restored'
  | 'cancelled'
  | 'pending'
  | 'failed'
  | 'unavailable'
  | 'already_owned'
  | 'busy';

export interface StoreProduct {
  productId: string;
  title: string;
  description: string;
  /** Localised price string from the store (e.g. "£2.99", "$3.99"). Never hardcode globally. */
  priceString: string;
  priceMicros: number;
  currencyCode: string;
}

export interface EntitlementSnapshot {
  /** True only when the store (or trusted offline cache of a prior store verification) says owned. */
  owned: boolean;
  source: EntitlementSource;
  /** Epoch ms of last successful store verification. */
  verifiedAt: number;
  /**
   * Opaque non-secret handle for dedupe (e.g. hashed transaction id).
   * Never store raw receipts or purchase tokens in logs or plain save fields meant for debugging.
   */
  transactionRef: string | null;
}

export interface PurchaseResult {
  outcome: PurchaseOutcome;
  entitlement: EntitlementSnapshot;
  /** Safe, user-facing message — never includes receipts/tokens. */
  message?: string;
}

export interface BillingAdapter {
  readonly platform: BillingPlatform;
  init(): Promise<void>;
  getLaunchProduct(): Promise<StoreProduct | null>;
  purchaseLaunchCollection(): Promise<PurchaseResult>;
  restorePurchases(): Promise<PurchaseResult>;
  /** Query current store entitlements without presenting UI. */
  refreshEntitlements(): Promise<EntitlementSnapshot>;
  /** Tear down listeners (transaction updates / billing client). */
  dispose(): void;
}
