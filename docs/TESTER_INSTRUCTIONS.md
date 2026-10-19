# Kickolé — internal tester instructions

Use these notes for **TestFlight** and **Google Play internal testing**. Public App Store / Play production must stay unpublished until the remaining blockers in [`RELEASE_VALIDATION.md`](./RELEASE_VALIDATION.md) are cleared.

## What is free

- **Customise** (skin tone, hair colour, hair silhouette, basic clothing colours) is always free.
- Starter boots and kit (**Street Classic**) are free.
- Coins are earned from play and spend only on shop boots/kits. Boots and kits are **cosmetic only** — they never change timing or scoring.

## How to earn unlocks

1. Complete scoring runs. Coins = floor(run score).
2. Open **Shop**. Locked items show their **exact** coin price and any lifetime challenge (alternating feet, stalls, perfect touches).
3. Buy when you meet the requirement, or **Equip** once owned.
4. Achievement / challenge progress stays earned through play; buying the Launch Collection does **not** grant challenge badges.

| Tier | Coins | Challenge |
| --- | --- | --- |
| Club | 2,500 | — |
| Street | 7,500 | Alternating foot touches (lifetime) |
| Freestyle | 15,000 | Foot stalls (lifetime) |
| Legend | 30,000 | Perfect touches (lifetime) |

## Kickolé Launch Collection (paid)

- **One-time** non-consumable purchase on the **iOS App Store** or **Google Play** only.
- Unlocks **this launch collection only** (all launch boots and kits listed in the Shop). Future collections are separate.
- Price shown in the app is the **store’s localised price** (UK list target £2.99).
- Free customise stays free. Challenges still need play.
- **Restore Purchases** reloads entitlement for the **same store account**. Apple purchases do **not** transfer to Google Play (and vice versa).
- Refunds may remove paid unlocks; items you bought with coins remain.

### How to test purchases (sandbox / licence testers only)

**Do not use real production payment instruments for automated or exploratory tests.**

**iOS:** Sandbox Apple ID or StoreKit Configuration in Xcode; TestFlight uses sandbox for IAP. Cover success, cancel, Ask to Buy / pending, airplane mode during purchase, force-quit mid-flow, double-tap purchase, restore with/without ownership, reinstall, second device same Apple ID, refund via App Store Connect if available.

**Android:** Add accounts under Play Console → Licence testing / license testers. Prefer test instruments. Cover PURCHASED vs PENDING, cancel, network loss, restore / check purchases, reinstall, second device same Google account, revoke. An internal-track tester alone is **not** always protected from real charges — confirm licence testing before tapping Buy.

**Web / browser:** Purchases are unavailable. Development `?simPurchase=1` must **not** grant real ownership in production builds.

## Restore after reinstall

1. Install from TestFlight or Play internal track.
2. Sign in with the **same** Apple / Google account used for the purchase.
3. Open Shop → **Restore Purchases**.
4. Launch boots/kits should become owned; coin balance and earned items from a previous install are **local** — they do not sync across devices unless you still have the same device save.

## Device checklist (testers)

- Small and larger phones; portrait safe areas; Android system Back from Shop/Customise/Settings.
- Scroll Shop lists; player preview updates; background/resume mid-run; Low/Medium/High graphics.
- Hair follows the head during kicks, stalls and freestyle tricks.
- Environments, movement and opening camera still feel correct.
