# Store privacy / Data Safety declarations

Copy these answers into App Store Connect privacy nutrition labels and Google Play Data safety. They match the **current** implementation (local device save and the world board). Update this file if you add analytics, accounts or other cloud saves.

Kickolé is paid upfront. The price is set in the stores. The app does not offer in-app purchases and does not collect purchase history.

## Data collection summary

| Category | Collected? | Notes |
| --- | --- | --- |
| Purchase history | No | No in-app purchases. Kickolé does not receive card numbers, receipts, or purchase tokens. |
| Device / app activity (appearance, settings) | Stored **on device** | `localStorage` / Capacitor Preferences. Not used for advertising. |
| Gameplay scores and nickname | Sent only if the player joins the leaderboard | Nickname picked from our word lists, random device id, score, combo, run length, and the country the player picked (if any). Other players can see the nickname and score. Country is not shown next to the name. The board is off until they tap Join leaderboard. No account. |
| Coarse network signal | Hashed IP, server only, 30 days | Used to limit cheating and report spam. The app does not read GPS. Country is the code the player chooses, not a location lookup. |
| Location, contacts, photos, files | No | Country is the code the player chooses. Kickolé does not read GPS or a network lookup to set it. |
| Advertising ID / analytics SDKs | No | None bundled in this release. |
| Account / login | No Kickolé account | The device id is a random install id, not an Apple or Google account. |

## App Store Connect — privacy nutrition (guidance)

- **Purchase History:** not collected by Kickolé. There are no in-app purchases to restore.
- **Product Interaction / Gameplay:** if the player joins, scores, a nickname picked from our word lists, and the chosen country are sent to the Kickolé scoreboard (Supabase) for app functionality. Not used for tracking. A hashed IP may be stored for 30 days to limit cheating.
- **Tracking:** No. App does not link with third-party data for advertising.
- **Privacy Policy URL:** point to the published policy that includes the Privacy text from Settings (and this repo’s wording).

## Google Play — Data safety (guidance)

- **Does your app collect or share user data?** Yes, only after the player joins the leaderboard. A nickname picked from our word lists, a random device id, a score and a chosen country are collected for the leaderboard (app functionality, not advertising). A hashed IP may be kept for 30 days to limit cheating. Kit choice and appearance stay on device.
- **In-app purchases:** No.
- **Data encryption / deletion:** The board is reached over HTTPS. In the app, Delete my leaderboard data removes the nickname and scores. If someone has reported that player, the report is kept for up to 90 days. Uninstall clears the on-device nickname, device id and country.
- **Families / children:** Declare age rating and Families policy separately if you target children. There are no in-app purchases.

Do not create an in-app product. Kit choice stays on the device.

Android `allowBackup` is true, so a device backup can include the on-device save (scores and appearance). The app does not send that save to IQ Apps Group.
