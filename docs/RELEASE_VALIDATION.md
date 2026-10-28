# Release validation

Internal TestFlight / Play internal-track preparation. **Production App Store and Play production tracks must remain unpublished** until the remaining blockers below are cleared.

Kickolé is a paid upfront app. The price is set in App Store Connect and the Play Console. This source has no in-app purchases.

## Platform / SDK requirements (submission baseline)

| Item | Value |
| --- | --- |
| Capacitor | 8.x (`@capacitor/android` / `ios` / `core`) |
| JDK for Android Gradle | **21** (Capacitor 8 / AGP requirement) |
| Android `minSdk` | 24 |
| Android `compileSdk` / `targetSdk` | **36** |
| Android `versionCode` / `versionName` | **1** / **1.0** (first internal candidate) |
| In-app purchases | **None.** No StoreKit plugin, no Play Billing dependency, no In-App Purchase capability. |
| iOS archive image | **macos-26** / Xcode 26 (required for App Store upload since 28 Apr 2026). Workflow `ios-testflight` in `codemagic.yaml` |
| iOS deployment target | **15.0** |
| iOS `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` | **1.0** / **1** |
| Bundle / application id | `com.iqappsgroup.kickole` |

Confirm these match the **existing** App Store Connect and Play Console apps before upload. Do not create replacement listings.

## Automated checks

`npm test` and `npm run typecheck` are the checks for this tree. A store build also fails if `VITE_ALLOW_MOCK` is set (`codemagic.yaml`, `ios-archive`, `validate`). This document does not record a fresh Android or iOS archive result.

## What this build includes

| Claim | Evidence |
| --- | --- |
| Skin tones, hair colours and kit colours are free | `appearance.ts`, Customise, kit colour picker |
| No coin balance and no store grant on the save | `shop.ts` wardrobe version 4, `storage.ts` |
| No billing plugin | `package.json`, `capacitor.config.ts`, empty `App.entitlements`, In-App Purchase capability removed from the Xcode project |
| Store web build refuses the mock board | `VITE_ALLOW_MOCK` guard in `codemagic.yaml` |
| Launch screens replace the Capacitor placeholder | `ios/App/App/Assets.xcassets/Splash.imageset`, three 2732×2732 images. `Contents.json` is unchanged |

## Distribution status template

| Track | Build | Status |
| --- | --- | --- |
| iOS TestFlight | version **1.0** | See the Codemagic `ios-testflight` run for the build number |
| Play internal | versionCode **1** | **Not uploaded** from this document |
| App Store production | — | **Unpublished** (do not submit) |
| Play production | — | **Unpublished** (do not promote) |

## Remaining blockers before public release

1. Confirm bundle/application id matches live listings.
2. Do not create in-app products. This build has no shop and no Restore Purchases.
3. Codemagic TestFlight upload (`ios-testflight`). Hand steps, including the App Store profile for `com.iqappsgroup.kickole`, are in [`TESTFLIGHT.md`](./TESTFLIGHT.md).
4. Play App Signing + upload keystore; build signed AAB; upload internal track.
5. Enter the privacy policy https://www.iqappsgroup.co.uk/kickole/privacy, the child safety statement https://www.iqappsgroup.co.uk/kickole/child-safety, and the terms https://www.iqappsgroup.co.uk/kickole/terms, plus the App Store Connect and Play Data safety answers from [`STORE_DATA_SAFETY.md`](./STORE_DATA_SAFETY.md).

**Store uploads have not been verified in this file.** The TestFlight build number comes from the Codemagic run, not from this page.
