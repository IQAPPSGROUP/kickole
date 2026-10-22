import { describe, expect, it } from 'vitest';
import {
  PACKS_RESTORED_MESSAGE,
  PURCHASES_RESTORED_MESSAGE,
  restoreBillingMessage,
} from './restoreMessage';
import { STORE_UNAVAILABLE_MESSAGE } from './storeCopy';

const NO_LAUNCH = 'No Launch Collection purchase found for this Google account.';

describe('restore billing message', () => {
  it('reports shop packs when a Play test purchase is the only entitlement', () => {
    expect(restoreBillingMessage({
      outcome: 'restored',
      launchOwned: false,
      launchMessage: NO_LAUNCH,
      packsConfirmed: true,
      ownedPacks: ['spooky'],
    })).toBe(PACKS_RESTORED_MESSAGE);
  });

  it('keeps the launch miss when the pack query did not answer', () => {
    expect(restoreBillingMessage({
      outcome: 'restored',
      launchOwned: false,
      launchMessage: NO_LAUNCH,
      packsConfirmed: false,
      ownedPacks: ['party'],
    })).toBe(NO_LAUNCH);
  });

  it('covers the launch collection and packs together', () => {
    expect(restoreBillingMessage({
      outcome: 'already_owned',
      launchOwned: true,
      launchMessage: 'You already own the Launch Collection on this Google account.',
      packsConfirmed: true,
      ownedPacks: ['everything'],
    })).toBe(PURCHASES_RESTORED_MESSAGE);
  });

  it('leaves a failed restore alone when no pack was confirmed', () => {
    expect(restoreBillingMessage({
      outcome: 'unavailable',
      launchOwned: false,
      launchMessage: undefined,
      packsConfirmed: false,
      ownedPacks: [],
    })).toBe(STORE_UNAVAILABLE_MESSAGE);
  });
});
