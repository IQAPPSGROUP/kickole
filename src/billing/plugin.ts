import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** Capacitor bridge — implemented natively on iOS (StoreKit 2) and Android (Play Billing). */
export interface KickoleBillingPlugin {
  echo(options: { value: string }): Promise<{ value: string }>;
  getLaunchProduct(): Promise<{
    productId: string;
    title: string;
    description: string;
    priceString: string;
    priceMicros: number;
    currencyCode: string;
  } | null>;
  purchaseLaunchCollection(): Promise<{
    outcome: string;
    owned: boolean;
    source: string;
    verifiedAt: number;
    transactionRef: string | null;
    message?: string;
  }>;
  restorePurchases(): Promise<{
    outcome: string;
    owned: boolean;
    source: string;
    verifiedAt: number;
    transactionRef: string | null;
    message?: string;
  }>;
  refreshEntitlements(): Promise<{
    owned: boolean;
    source: string;
    verifiedAt: number;
    transactionRef: string | null;
  }>;
  getProducts(options: { productIds: string[] }): Promise<{
    products: Array<{
      productId: string;
      title: string;
      description: string;
      priceString: string;
      priceMicros: number;
      currencyCode: string;
    }>;
  }>;
  purchaseProduct(options: { productId: string }): Promise<{
    outcome: string;
    productId?: string;
    source: string;
    message?: string;
  }>;
  ownedProductIds(): Promise<{ productIds: string[] }>;
  addListener(
    eventName: 'entitlementChanged',
    listenerFunc: (event: {
      owned: boolean;
      source: string;
      verifiedAt: number;
      transactionRef: string | null;
    }) => void,
  ): Promise<PluginListenerHandle>;
}

export const KickoleBilling = registerPlugin<KickoleBillingPlugin>('KickoleBilling', {
  web: () => import('./adapters/web-plugin').then((m) => new m.KickoleBillingWeb()),
});
