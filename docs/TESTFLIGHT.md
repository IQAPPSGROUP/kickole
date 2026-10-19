# Kickolé TestFlight

iOS builds run on Codemagic (`mac_mini_m2`, Xcode 26 or newer). Workflows are in `codemagic.yaml` and start from the Codemagic UI. They do not run on every push. Nothing in this repo is an Apple certificate, provisioning profile, API key, or App Store Apple ID.

The signed workflow is `ios-testflight`. `ios-simulator` is an unsigned compile check (`CODE_SIGNING_ALLOWED=NO`) and does not upload.

## What you do by hand

1. In the Apple Developer portal, register the App ID `com.iqappsgroup.kickole` and enable the **In-App Purchase** capability.
2. In App Store Connect, create the Kickolé app record for that bundle ID. Leave the production App Store version unpublished.
3. In Codemagic, add the `IQAPPSGROUP/kickole` repository. Reuse the existing App Store Connect integration named **Amigos App Store Connect**. Make sure the team code-signing identities include an Apple Distribution certificate and an App Store provisioning profile for `com.iqappsgroup.kickole` (generate or fetch them with that integration). Do not commit the certificate or profile.
4. In Codemagic, create the environment group `kickole_app_store` and add `APP_STORE_APPLE_ID`. The value is the numeric Apple ID under App Store Connect → Kickolé → General → App Information. Mark it secret. Do not commit it or print it in a build log.
5. Run the `ios-testflight` workflow. It installs dependencies, runs the test suite and typecheck, builds the web app, runs `npx cap sync ios`, applies the App Store profile, sets the build number to the latest TestFlight build plus one, and uploads the IPA with TestFlight submission on and App Store submission off.
6. After App Store Connect finishes processing the build, add testers in TestFlight.

## Already in the Xcode project

| Item | Value |
| --- | --- |
| Project / scheme | `ios/App/App.xcodeproj`, scheme `App` (no `App.xcworkspace`) |
| Bundle ID | `com.iqappsgroup.kickole` |
| Marketing version | `1.0` (`MARKETING_VERSION`; the workflow replaces the build number) |
| In-App Purchase | Enabled on the App target |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` |
| Export compliance | `ITSAppUsesNonExemptEncryption` is `false` |
| App icon | Present (`AppIcon`, Kickolé wordmark) |
| Launch screen | `LaunchScreen.storyboard` is wired up |

The launch images in `ios/App/App/Assets.xcassets/Splash.imageset` are still the Capacitor placeholder (white field, Capacitor logo in the centre). Replace them before an external TestFlight looks finished. The app icon is not a placeholder.

`?simPurchase=1` / `dev_sim` can grant the Launch Collection only in a Vite development serve. `npm run ios:sync` uses the production web build, and that build ignores the query and any saved `dev_sim` locker.
