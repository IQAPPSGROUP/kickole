import { STORE_UNAVAILABLE_MESSAGE } from './storeCopy';
import type { PurchaseOutcome } from './types';

/** Shown when Restore confirmed pack product ids and the Launch Collection is absent. */
export const PACKS_RESTORED_MESSAGE = 'Shop packs restored for this account.';

/** Shown when Restore confirmed both the Launch Collection and at least one shop pack. */
export const PURCHASES_RESTORED_MESSAGE = 'Purchases restored for this account.';

/**
 * Launch Collection restore and the pack query are separate store calls.
 * A Play license-tester pack (free test card, often a null order id) is a
 * normal PURCHASED product. When that query confirms packs, say so instead of
 * repeating "No Launch Collection purchase found".
 */
export function restoreBillingMessage(input: {
  outcome: PurchaseOutcome;
  launchOwned: boolean;
  launchMessage: string | null | undefined;
  packsConfirmed: boolean;
  ownedPacks: readonly string[];
}): string | null {
  const launchMessage = input.launchMessage ?? null;
  const packsOwned = input.packsConfirmed && input.ownedPacks.length > 0;
  switch (input.outcome) {
    case 'pending':
    case 'cancelled':
    case 'busy':
      return launchMessage;
    case 'failed':
    case 'unavailable':
      return packsOwned ? PACKS_RESTORED_MESSAGE : (launchMessage ?? STORE_UNAVAILABLE_MESSAGE);
    case 'purchased':
    case 'restored':
    case 'already_owned':
      if (packsOwned && input.launchOwned) return PURCHASES_RESTORED_MESSAGE;
      if (packsOwned) return PACKS_RESTORED_MESSAGE;
      return launchMessage;
    default: {
      const neverOutcome: never = input.outcome;
      return neverOutcome;
    }
  }
}
