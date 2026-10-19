import { WebPlugin } from '@capacitor/core';
import type { KickoleBillingPlugin } from '../plugin';

/** Browser stub — purchases are unavailable in the web build. */
export class KickoleBillingWeb extends WebPlugin implements KickoleBillingPlugin {
  async echo(options: { value: string }) {
    return options;
  }

  async getLaunchProduct() {
    return null;
  }

  async purchaseLaunchCollection() {
    return {
      outcome: 'unavailable',
      owned: false,
      source: 'none',
      verifiedAt: 0,
      transactionRef: null,
      message: 'In-app purchases are available in the iOS and Android apps only.',
    };
  }

  async restorePurchases() {
    return {
      outcome: 'unavailable',
      owned: false,
      source: 'none',
      verifiedAt: 0,
      transactionRef: null,
      message: 'Restore Purchases is available in the iOS and Android apps only. Apple and Google purchases do not transfer between stores.',
    };
  }

  async refreshEntitlements() {
    return {
      owned: false,
      source: 'none',
      verifiedAt: 0,
      transactionRef: null,
    };
  }
}
