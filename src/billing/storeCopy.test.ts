import { describe, expect, it } from 'vitest';
import { LAUNCH_COLLECTION_ITEM_IDS } from '../game/catalogue';
import {
  initialBillingMessage,
  launchCollectionBlurb,
  launchPurchaseLabel,
  launchStoreNote,
  shouldRefreshEntitlementsOnResume,
  STORE_UNAVAILABLE_MESSAGE,
} from './storeCopy';

describe('store copy', () => {
  it('describes the launch collection as unlocking challenge-gated cosmetics', () => {
    const text = launchCollectionBlurb(LAUNCH_COLLECTION_ITEM_IDS.length);
    expect(LAUNCH_COLLECTION_ITEM_IDS).toHaveLength(14);
    expect(text).toContain('all 14 launch boots and kits');
    expect(text).toContain('challenge progress');
    expect(text).toContain('does not complete the challenges');
    expect(text.toLowerCase()).not.toContain('still need real play');
  });

  it('does not tell a native player that payments are browser-only when the product failed to load', () => {
    expect(launchStoreNote('android', false)).toBe(STORE_UNAVAILABLE_MESSAGE);
    expect(launchStoreNote('ios', false)).toBe(STORE_UNAVAILABLE_MESSAGE);
    expect(launchPurchaseLabel('android', null, false)).toBe('STORE UNAVAILABLE');
    expect(launchPurchaseLabel('ios', null, false)).toBe('STORE UNAVAILABLE');
    expect(launchStoreNote('web', false)).toMatch(/Browser builds cannot take real payments/);
    expect(launchPurchaseLabel('web', null, false)).toBe('UNLOCK ON iOS / ANDROID');
    expect(launchStoreNote('android', true)).toBeNull();
    expect(launchPurchaseLabel('android', '£2.99', false)).toBe('UNLOCK · £2.99');
  });

  it('refreshes entitlements when a native app returns to the foreground', () => {
    expect(shouldRefreshEntitlementsOnResume('android', 'visible')).toBe(true);
    expect(shouldRefreshEntitlementsOnResume('ios', 'visible')).toBe(true);
    expect(shouldRefreshEntitlementsOnResume('android', 'hidden')).toBe(false);
    expect(shouldRefreshEntitlementsOnResume('web', 'visible')).toBe(false);
    expect(initialBillingMessage('ios', false)).toBe(STORE_UNAVAILABLE_MESSAGE);
    expect(initialBillingMessage('web', false)).toBeNull();
    expect(initialBillingMessage('android', true)).toBeNull();
  });
});