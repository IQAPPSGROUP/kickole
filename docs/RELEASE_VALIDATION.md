# Release validation — wardrobe & shop (`feature/wardrobe-and-shop`)

Internal TestFlight / Play internal-track preparation. **Production App Store and Play production tracks must remain unpublished** until remaining blockers below are cleared.

## Platform / SDK requirements (submission baseline)

| Item | Value |
| --- | --- |
| Capacitor | 8.x (`@capacitor/android` / `ios` / `core`) |
| JDK for Android Gradle | **21** (Capacitor 8 / AGP requirement) |
| Android `minSdk` | 24 |
| Android `compileSdk` / `targetSdk` | **36** |
| Android `versionCode` / `versionName` | **1** / **1.0** (first internal candidate) |
| In-app purchases | **None.** No StoreKit or Play Billing plugin in this build. |
| iOS archive image | **macos-26** / Xcode 26 (required for App Store upload since 28 Apr 2026). No Codemagic config in repo |
| iOS deployment target | **15.0** |
| iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | **1.0** / **1** |
| Bundle / application id | `com.iqappsgroup.kickole` |

Confirm these match the **existing** App Store Connect and Play Console apps before upload. Do not create replacement listings.

## Automated checks (this environment)

| Check | Result |
| --- | --- |
| `npm test` | **167 passed** (includes billing regression tests) |
| `npm run typecheck` | **pass** |
| `npm run build` (`VITE_ENVIRONMENT_THEME=beach`) | **pass** |
| Android `assembleDebug` (JDK 21 + SDK 36) | **BUILD SUCCESSFUL** (debug APK; Play Billing 9.1.0 compiled; unsigned for Play) |
| iOS archive / TestFlight upload | **Codemagic** workflow `ios-testflight` ([`TESTFLIGHT.md`](./TESTFLIGHT.md)). Not run from this host |
| Play internal AAB upload | **Blocked** — no upload keystore / Play API credentials |

## Experience validation matrix

### Free customisation — automated / code review

| Claim | Evidence |
| --- | --- |
| Skin tones, hair colours and clothing colours free | `appearance.ts` + Customise UI; no coin gate |
| Authored hair follows the head | Purchased `Hair` mesh, skinned to the head bone (`player-v4.test.ts`) |
| Appearance ≠ kit/boot ownership | Shop buy tests leave appearance unchanged |

### Shop and progression — automated

| Claim | Evidence |
| --- | --- |
| Boots/kits independent, cosmetic | `shop.test.ts`; engine does not read equipment for timing |
| Coin/challenge gates | Street/freestyle/legend lock tests |
| Locked items show requirements | `UnlockHint` in Shop UI |
| Launch collection grant | `grantLaunchCollection` + billing tests |
| Challenges remain earned | Grant does not mutate challenge counters |
| Migration preserves balances | `storage.test.ts` / `shop.test.ts` legacy mapping |
| No duplicate coin/ownership rewards | Re-equip and `saveRun` tests |

### Purchases — automated vs physical

| Scenario | Automated | Physical device (required) |
| --- | --- | --- |
| Successful purchase | Fake adapter grant | Sandbox / licence tester |
| Cancel / decline | Outcome `cancelled` | Both stores |
| Pending / deferred | No unlock on `pending` | Ask to Buy / Play PENDING |
| Network loss / kill mid-purchase | Offline retain of verified cache | Manual |
| Duplicate taps | `billingBusy` busy outcome | Manual |
| Restore with/without purchase | Adapter restore paths | Manual |
| Reinstall / second device | Store query + Restore | Manual |
| Refund / revoke | `revokeLaunchCollection` keeps coin items | Console refund |
| Offline after verified | `syncEntitlements` keep cache | Manual |
| Localised price | `priceString` from product | Confirm storefront |
| Dev mock not production entitlement | `dev_sim` blocked in `PROD` | Confirm release build |

**Physical-device purchase and UI checks were not executed in this agent environment** (no TestFlight/Play upload, no attached phones). Distinguish browser/emulator results from device evidence in any follow-up report.

## Catalogue / progression (launch)

- Boots (8) / kits (6) — see [`WARDROBE_SHOP.md`](./WARDROBE_SHOP.md).
- Launch IDs: `LAUNCH_COLLECTION_ITEM_IDS` in `src/game/catalogue.ts` (only these are IAP-granted).
- Future pack SKUs must use **new** item IDs outside that list.

## Distribution status template

| Track | Build | Status |
| --- | --- | --- |
| iOS TestFlight | version **1.0** (build **1**) | **Not uploaded** — see blockers |
| Play internal | versionCode **1** | **Not uploaded** — see blockers |
| App Store production | — | **Unpublished** (do not submit) |
| Play production | — | **Unpublished** (do not promote) |

## Remaining blockers before public release

1. Confirm bundle/application id matches live listings.
2. Do not create in-app products. This build has no shop and no Restore Purchases. See [`BILLING.md`](./BILLING.md).
3. Codemagic TestFlight upload (`ios-testflight`). Hand steps, including the App Store profile for `com.iqappsgroup.kickole`, are in [`TESTFLIGHT.md`](./TESTFLIGHT.md).
4. Play App Signing + upload keystore; build signed AAB; upload internal track.
5. Publish privacy policy URL + ASC / Play Data safety from [`STORE_DATA_SAFETY.md`](./STORE_DATA_SAFETY.md).

**Store uploads have not been verified here.**
