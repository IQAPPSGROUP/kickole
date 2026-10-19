# Store privacy / Data Safety declarations

Copy these answers into App Store Connect privacy nutrition labels and Google Play Data safety. They match the **current** implementation (local device save + store-mediated IAP). Update this file if you add analytics, accounts or cloud saves.

## Data collection summary

| Category | Collected? | Notes |
| --- | --- | --- |
| Purchase history | Processed by Apple / Google | Kickolé does **not** receive card numbers. Entitlement is verified via StoreKit 2 / Play Billing on device. |
| Device / app activity (scores, coins, appearance) | Stored **on device only** | `localStorage` / Capacitor WebView storage. Not sent to IQ Apps Group servers today. |
| Location, contacts, photos, files | No | |
| Advertising ID / analytics SDKs | No | None bundled in this release. |
| Account / login | No Kickolé account | Store account is used only by Apple/Google for IAP. |

## App Store Connect — privacy nutrition (guidance)

- **Purchase History:** linked to the user via Apple; used for App Functionality (restore entitlements). Not used for tracking.
- **Product Interaction / Gameplay:** if you declare on-device data only and do not transmit it, follow Apple’s current guidance for data that never leaves the device (often omitted from “collected” when not transmitted — confirm against the latest ASC questionnaire).
- **Tracking:** No. App does not link with third-party data for advertising.
- **Privacy Policy URL:** point to the published policy that includes the Purchases & privacy text from Settings (and this repo’s wording).

## Google Play — Data safety (guidance)

- **Does your app collect or share user data?** On-device save only → typically **No** for developer-collected data, **unless** you later add analytics or a backend. Play Billing purchase data is handled by Google.
- **In-app purchases:** Yes — one non-consumable product `kickole_launch_collection`.
- **Data encryption / deletion:** N/A for server-held player data (none). Uninstall clears local storage.
- **Families / children:** Declare age rating and Families policy separately if you target children; IAP must comply with Play policies.

## In-app purchase listing copy (both stores)

**Name:** Kickolé Launch Collection  

**Description:** One-time unlock of every boot and kit in the Kickolé launch collection, including items that otherwise require challenge progress. It does not complete those challenges. Free skin tones, hairstyles and basic styling stay free. Future collections are sold separately. No subscriptions or consumable coin packs. Restore Purchases uses your App Store or Google Play account. Purchases do not transfer between Apple and Google.

Android `allowBackup` is true, so a device backup can include the on-device save (scores, coins, appearance, cached entitlement). The next native launch re-checks that entitlement with the store. The app does not send that save to IQ Apps Group.

**Price:** Configure UK £2.99 (or current equivalent tier); the app displays the store’s localised price string.
