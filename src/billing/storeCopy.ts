import type { BillingPlatform } from './types';

/** Shown when a native store cannot load the Launch Collection product. */
export const STORE_UNAVAILABLE_MESSAGE = 'Store unavailable, try again.';

export function launchPurchaseLabel(
  platform: BillingPlatform,
  priceString: string | null,
  busy: boolean,
): string {
  if (busy) return 'PLEASE WAIT…';
  if (priceString) return `UNLOCK · ${priceString}`;
  switch (platform) {
    case 'web':
      return 'UNLOCK ON iOS / ANDROID';
    case 'ios':
    case 'android':
      return 'STORE UNAVAILABLE';
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

/** Pack button. A price is the store priceString alone. Owned and busy never show a price. */
export function packButtonLabel(
  platform: BillingPlatform,
  priceString: string | null,
  busy: boolean,
  owned: boolean,
): string {
  if (owned) return 'OWNED';
  if (busy) return 'PLEASE WAIT…';
  if (priceString) return priceString;
  switch (platform) {
    case 'web':
      return 'UNLOCK ON iOS / ANDROID';
    case 'ios':
    case 'android':
      return 'STORE UNAVAILABLE';
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

export function launchStoreNote(platform: BillingPlatform, hasPrice: boolean): string | null {
  if (hasPrice) return null;
  switch (platform) {
    case 'web':
      return 'Browser builds cannot take real payments. Install the Kickolé iOS or Android app to buy with your local store price (UK list target £2.99). Apple and Google purchases do not transfer between stores.';
    case 'ios':
    case 'android':
      return STORE_UNAVAILABLE_MESSAGE;
    default: {
      const exhaustive: never = platform;
      return exhaustive;
    }
  }
}

/** In-app description of what the one-time purchase actually unlocks. */
export function launchCollectionBlurb(itemCount: number): string {
  return `One permanent unlock for this launch collection only — all ${itemCount} launch boots and kits, including Street, Freestyle and Legend items that otherwise need challenge progress. Future collections are sold separately. Skin tones, hair and basic styling stay included. The purchase unlocks those cosmetics. It does not complete the challenges.`;
}

export function shouldRefreshEntitlementsOnResume(platform: BillingPlatform, visibilityState: string): boolean {
  return platform !== 'web' && visibilityState === 'visible';
}

export function initialBillingMessage(platform: BillingPlatform, hasProduct: boolean): string | null {
  if (platform === 'web' || hasProduct) return null;
  return STORE_UNAVAILABLE_MESSAGE;
}
