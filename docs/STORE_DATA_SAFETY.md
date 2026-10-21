# Store privacy / Data Safety declarations

Copy these answers into App Store Connect privacy nutrition labels and Google Play Data safety. They match the **current** implementation (local device save, the world board, and store-mediated IAP). Update this file if you add analytics, accounts or other cloud saves.

## Data collection summary

| Category | Collected? | Notes |
| --- | --- | --- |
| Purchase history | Processed by Apple / Google | Kickolé does **not** receive card numbers. Entitlement is verified via StoreKit 2 / Play Billing on device. |
| Device / app activity (coins, appearance, settings) | Stored **on device** | `localStorage` / Capacitor Preferences. Not used for advertising. |
| Gameplay scores and nickname | Sent only if the player joins the leaderboard | Nickname picked from our word lists, random device id, score, combo, run length, and the country the player picked (if any). Other players can see the nickname, flag and score. The board is off until they tap Join leaderboard. No account. |
| Coarse network signal | Hashed IP, server only, 30 days | Used to limit cheating and report spam. The app does not read GPS. Country is the code the player chooses, not a location lookup. |
| Location, contacts, photos, files | No | Country is the code the player chooses. Kickolé does not read GPS or a network lookup to set it. |
| Advertising ID / analytics SDKs | No | None bundled in this release. |
| Account / login | No Kickolé account | The device id is a random install id, not an Apple or Google account. Store account is used only by Apple/Google for IAP. |

## App Store Connect — privacy nutrition (guidance)

- **Purchase History:** linked to the user via Apple; used for App Functionality (restore entitlements). Not used for tracking.
- **Product Interaction / Gameplay:** if the player joins, scores, a nickname picked from our word lists, and the chosen country are sent to the Kickolé scoreboard (Supabase) for app functionality. Not used for tracking. A hashed IP may be stored for 30 days to limit cheating.
- **Tracking:** No. App does not link with third-party data for advertising.
- **Privacy Policy URL:** point to the published policy that includes the Purchases & privacy text from Settings (and this repo’s wording).

## Google Play — Data safety (guidance)

- **Does your app collect or share user data?** Yes, only after the player joins the leaderboard. A nickname picked from our word lists, a random device id, a score and a chosen country are collected for the leaderboard (app functionality, not advertising). A hashed IP may be kept for 30 days to limit cheating. Coins and appearance stay on device. Play Billing purchase data is handled by Google.
- **In-app purchases:** Yes — one non-consumable product `kickole_launch_collection`.
- **Data encryption / deletion:** The board is reached over HTTPS. In the app, Delete my leaderboard data removes the nickname and scores. If someone has reported that player, the report is kept for up to 90 days. Uninstall clears the on-device nickname, device id and country.
- **Families / children:** Declare age rating and Families policy separately if you target children; IAP must comply with Play policies.

## In-app purchase listing copy (both stores)

**Name:** Kickolé Launch Collection  

**Description:** One-time unlock of every boot and kit in the Kickolé launch collection, including items that otherwise require challenge progress. It does not complete those challenges. Free skin tones, hair colours and basic styling stay free. Future collections are sold separately. No subscriptions or consumable coin packs. Restore Purchases uses your App Store or Google Play account. Purchases do not transfer between Apple and Google.

Android `allowBackup` is true, so a device backup can include the on-device save (scores, coins, appearance, cached entitlement). The next native launch re-checks that entitlement with the store. The app does not send that save to IQ Apps Group.

**Price:** Configure UK £2.99 (or current equivalent tier); the app displays the store’s localised price string.
