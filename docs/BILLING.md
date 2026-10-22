# Kickolé Launch Collection — billing

One permanent, non-consumable in-app purchase. No subscriptions, consumable coin packs or paid random rewards.

## Product

| Field | Value |
| --- | --- |
| Display name | Kickolé Launch Collection |
| Product ID (both stores) | `kickole_launch_collection` |
| Type | Non-consumable / one-time in-app product |
| UK list price target | £2.99 (configure in each store console; app shows **localised** `priceString` from the store SDK) |
| Unlocks | Every ID in `LAUNCH_COLLECTION_ITEM_IDS` (`src/game/catalogue.ts`) — all 14 launch boots and kits, including Street, Freestyle and Legend items that otherwise need challenge progress |
| Does not unlock | Future collections; free customise (skin/hair/colours); challenge counters themselves (the purchase does not mark challenges complete) |

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

1. **Authoritative source:** Apple Transaction.currentEntitlements / Google `PurchaseState.PURCHASED` queries. Pending and cancelled purchases do not grant.
2. **Client delivery:** unlock only after verification; finish (StoreKit) / acknowledge (Play) after delivery. Never consume the Play product. A failed acknowledgement is retried once and again on the next refresh, restore or resume (Play's 3-day window).
3. **Local cache:** on **native**, `launchCollectionOwned` + `entitlementSource` (`apple`|`google`) + `entitlementVerifiedAt` retain access when a store query fails or returns no definitive answer. A bare boolean without a store source is ignored. On **web**, an `apple` or `google` source string is also ignored — it is not a receipt. Coin-owned item IDs in the save are still accepted, because that is how local coin purchases are stored.
4. **Revoke only when definitive:** a non-OK Play `queryPurchasesAsync` (or a timed-out connection) must not clear an owned Launch Collection. Revoke when the store reports the product is not `PURCHASED` (refund, revoke, or a completed restore that finds nothing).
5. **While the app is open:** StoreKit `Transaction.updates` and Play `PurchasesUpdatedListener` emit `entitlementChanged`. The app also re-queries on resume (iOS foreground, Android `onResume`, and the web view becoming visible).
6. **Web:** purchases unavailable; `?simPurchase=1` grants `dev_sim` only in **development** builds. Production never grants from `dev_sim`.
7. **TestFlight costumes:** the iOS plugin reads `Bundle.main.appStoreReceiptURL?.lastPathComponent` at runtime. `sandboxReceipt` unlocks every outfit for that session only and shows “Tester: all outfits unlocked”. An App Store receipt (`receipt`) does not. There is no build flag, because the same binary is promoted. Android returns false. Play cannot tell a closed or internal track from production at runtime, so the app does not unlock Android outfits in code. Android testers are Play Console license testers and buy packs with Google’s free test card. Those purchases are ordinary `PURCHASED` one-time products (the order id is often null). Restore acknowledges them and grants the matching packs through the same `queryPurchasesAsync` path as a production purchase. The iOS unlock is not written as a store purchase.
8. **Refunds / revokes:** StoreKit `revocationDate` and Play absence on a successful query remove `launchGrantedItemIds` only. Coin-purchased items remain.
9. **Cross-store:** Apple ↔ Google do not transfer. Restore is per store account.
10. **No secrets in logs:** adapters never log receipts, purchase tokens or credentials. `transactionRef` is a truncated opaque handle only.

### Play Billing Library 9.1.0

`plugins/kickole-billing` depends on `com.android.billingclient:billing:9.1.0` (Play stopped accepting Billing Library 7 for new apps and updates on 31 Aug 2026).

| PBL 7 call | What this plugin does |
| --- | --- |
| `queryPurchaseHistoryAsync` (removed) | Not used. Active and pending one-time purchases come from `queryPurchasesAsync(QueryPurchasesParams)`. Refunds show up as absence from that query, not from purchase history. |
| `enablePendingPurchases()` with no args (removed) | `enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())` |
| `queryProductDetailsAsync` list callback | `ProductDetailsResponseListener` receives `QueryProductDetailsResult`. The price and purchase use the first eligible one-time offer and its offer token. |
| Manual reconnect only | `enableAutoServiceReconnection()`, plus a 15s connection timeout so Unlock / Restore / refresh cannot wait forever |
| `launchBillingFlow` sub-response | Insufficient funds and ineligible accounts get a specific message. A blocked Play Store (`BILLING_UNAVAILABLE`) is treated as store unavailable, not as "not owned". |

`ITEM_ALREADY_OWNED` queries current purchases and resolves as `already_owned` when the account still has `PURCHASED`. It does not consume the product.

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

Plugin sources: `plugins/kickole-billing` (StoreKit 2 Swift, Play Billing Library **9.1.0** Java).

### iOS upload toolchain

Since 28 Apr 2026, App Store uploads require **Xcode 26**. `.github/workflows/ios-archive.yml` runs on `macos-26` (that image includes Xcode 26) and prints `xcodebuild -version`. It still stops before signing: the archive/upload steps are a placeholder and this repo has no Apple secrets. There is no `codemagic.yaml`. A Codemagic workflow, when added, needs `xcode: 26` and the same signing secrets kept out of git.

The iOS target records the In-App Purchase capability, ships `PrivacyInfo.xcprivacy` (no tracking, no collected data types), sets `ITSAppUsesNonExemptEncryption` to false (only platform HTTPS / store crypto), and requires `arm64` rather than the old `armv7` template value. Portrait and landscape stay enabled; the game camera and layout already support both.

## Remaining setup (not verified for live billing)

Implementation and automated TS tests are in place. Native projects live under `android/` and `ios/`; `cap sync` registers `kickole-billing`. See [`RELEASE_VALIDATION.md`](./RELEASE_VALIDATION.md) for SDK versions and the purchase test matrix. Tester copy: [`TESTER_INSTRUCTIONS.md`](./TESTER_INSTRUCTIONS.md).

Still required before claiming live billing or public release:

1. Confirm `com.iqappsgroup.kickole` matches the **existing** App Store Connect and Play Console apps (change `capacitor.config.ts` if your live id differs — do not create a replacement listing).
2. Create product `kickole_launch_collection` (non-consumable / one-time) at UK £2.99 in both consoles.
3. Signing: Codemagic `ios-testflight` ([`TESTFLIGHT.md`](./TESTFLIGHT.md)) using the existing App Store Connect integration; Play App Signing / upload keystore (do not commit keystores). Upload to **TestFlight** and Play **internal** only — keep production unpublished.
4. Device tests with StoreKit / sandbox and Play **licence testers** (not production cards): see tester instructions.
5. Optional: App Store Server API + Play Developer API verification service (documented above).

**Live billing and store console uploads are not claimed verified until the above are done on signed device builds.**
