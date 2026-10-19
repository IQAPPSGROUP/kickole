# Kickolé Launch Collection — billing

One permanent, non-consumable in-app purchase. No subscriptions, consumable coin packs or paid random rewards.

## Product

| Field | Value |
| --- | --- |
| Display name | Kickolé Launch Collection |
| Product ID (both stores) | `kickole_launch_collection` |
| Type | Non-consumable / one-time in-app product |
| UK list price target | £2.99 (configure in each store console; app shows **localised** `priceString` from the store SDK) |
| Unlocks | Every ID in `LAUNCH_COLLECTION_ITEM_IDS` (`src/game/catalogue.ts`) |
| Does not unlock | Future collections; free customise (skin/hair/colours); achievement challenges |

## Application identifiers

| Platform | Identifier |
| --- | --- |
| Capacitor / Android applicationId / iOS bundle id | `com.iqappsgroup.kickole` |

These must match the existing App Store Connect app and Play Console app owned by IQ Apps Group. **Do not create replacement listings.** If your live listing uses a different bundle/application id, update `capacitor.config.ts` and native projects to match the live id before shipping — do not invent credentials here.

## App Store Connect setup

1. Open the Kickolé iOS app (bundle id above).
2. Features → In-App Purchases → create **Non-Consumable**.
3. Product ID: `kickole_launch_collection` (exact).
4. Reference name: Kickolé Launch Collection.
5. Price: UK £2.99 tier (or current Apple price schedule equivalent); other territories follow Apple’s localisation.
6. Add localised display name/description for each supported storefront language you ship.
7. Submit the IAP with the app version that includes StoreKit 2 (`plugins/kickole-billing` iOS sources).
8. Sandbox: use Sandbox Apple IDs; do not use production accounts on debug builds.
9. Paid Apps Agreement, banking and tax must be active or products will not load.

## Google Play Console setup

1. Open the Kickolé Android app (`com.iqappsgroup.kickole`).
2. Monetize → In-app products → Create product.
3. Product ID: `kickole_launch_collection` (exact).
4. Name/description: Kickolé Launch Collection.
5. Price: set UK to £2.99; Play localises other countries.
6. Status: Active. One-time product (not subscription). **Do not** mark as consumable.
7. License testers for internal/closed testing.
8. App must be uploaded with `BILLING` permission (provided by the billing plugin manifest merge).

## Verification architecture

```
┌─────────────┐     StoreKit 2 / Play Billing      ┌──────────────┐
│ Capacitor   │ ─────────────────────────────────► │ Apple/Google │
│ KickoleBilling│ ◄──── verified entitlement ──────│ store        │
└──────┬──────┘                                    └──────────────┘
       │ grantLaunchCollection / revokeLaunchCollection
       ▼
┌─────────────┐
│ Wardrobe    │  launchCollectionOwned + launchGrantedItemIds
│ save (cache)│  coin-owned items tracked separately
└─────────────┘
```

1. **Authoritative source:** Apple Transaction.currentEntitlements / Google `PurchaseState.PURCHASED` queries.
2. **Client delivery:** unlock only after verification; finish (StoreKit) / acknowledge (Play) after delivery. Never consume the Play product.
3. **Local cache:** `launchCollectionOwned` + `entitlementSource` (`apple`|`google`) + `entitlementVerifiedAt` retain access during short network failures. A bare boolean without store source is **ignored** (blocks hand-edited localStorage unlocks).
4. **Web:** purchases unavailable; `?simPurchase=1` grants `dev_sim` only in **development** builds.
5. **Refunds / revokes:** StoreKit `revocationDate` and Play absence on query remove `launchGrantedItemIds` only. Coin-purchased items remain.
6. **Cross-store:** Apple ↔ Google do not transfer. Restore is per store account.
7. **No secrets in logs:** adapters never log receipts, purchase tokens or credentials. `transactionRef` is a truncated opaque handle only.

### Recommended secure server (not required for first native ship)

For stronger anti-fraud on multiplayer or cloud saves (future):

- **Apple:** App Store Server API — verify transactions with your app’s issuer key; store only opaque user entitlement server-side.
- **Google:** Play Developer API `purchases.products.get` with a service account; acknowledge from server if you move acknowledgement off-device.

Host verification endpoints behind your backend; never embed shared secrets in the web bundle. Until that service exists, native store SDKs remain the verification boundary documented above.

## Native packaging

```bash
npm run build
npx cap add android   # once
npx cap add ios       # once (macOS)
npx cap sync
npx cap open android
npx cap open ios
```

Plugin sources: `plugins/kickole-billing` (StoreKit 2 Swift, Play Billing Library Java).

## Remaining setup (not verified for live billing)

Implementation and automated TS tests are in place. Native projects live under `android/` and `ios/`; `cap sync` registers `kickole-billing`. See [`RELEASE_VALIDATION.md`](./RELEASE_VALIDATION.md) for SDK versions and the purchase test matrix. Tester copy: [`TESTER_INSTRUCTIONS.md`](./TESTER_INSTRUCTIONS.md).

Still required before claiming live billing or public release:

1. Confirm `com.iqappsgroup.kickole` matches the **existing** App Store Connect and Play Console apps (change `capacitor.config.ts` if your live id differs — do not create a replacement listing).
2. Create product `kickole_launch_collection` (non-consumable / one-time) at UK £2.99 in both consoles.
3. Signing: Apple certificates/profiles on a Mac; Play App Signing / upload keystore (do not commit keystores). Upload to **TestFlight** and Play **internal** only — keep production unpublished.
4. Device tests with StoreKit / sandbox and Play **licence testers** (not production cards): see tester instructions.
5. Optional: App Store Server API + Play Developer API verification service (documented above).

**Live billing and store console uploads are not claimed verified until the above are done on signed device builds.**
