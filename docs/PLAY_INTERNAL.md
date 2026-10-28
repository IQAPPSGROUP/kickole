# Kickolé Play internal

Android builds run on Codemagic (`mac_mini_m2`, Java 21). The workflow is `android-internal` in `codemagic.yaml`. It starts from the Codemagic UI. It does not run on every push. Nothing in this repo is an upload keystore, a keystore password, or a Google Play service-account key.

The bundle is a draft on the Play internal track. Production Play stays unpublished.

## What you do by hand

1. In the Play Console, keep the app id `com.iqappsgroup.kickole`. Do not add an in-app product. The app is paid upfront. The price is set in the Play Console, not in this repo.
2. In Codemagic, open Team settings, then Code signing identities, then Android keystores. Upload the Kickolé upload keystore. Set the reference name to `kickole`. That is the name `codemagic.yaml` uses. Keep your own copy of the keystore. Codemagic cannot give it back, and it must not be committed.
3. In Google Cloud, create a Play service account and a JSON key. In the Play Console, invite that account and give it release access for Kickolé. Do not give it admin access.
4. In Codemagic, add a secret environment variable named `GOOGLE_PLAY_SERVICE_ACCOUNT_CREDENTIALS` in the group `google_play`. Paste the JSON key as the value. Do not commit the JSON, and do not print it in a build log.
5. Run `android-internal`. It installs dependencies, runs the tests and the type check, builds the web app, syncs Android, and builds a signed `.aab`. The version code is the Codemagic build number. The draft is sent to the internal track.
6. The first bundle Play has ever seen for this app still has to be uploaded once by hand. Download the `.aab` from the Codemagic artifacts and upload that draft yourself. Later runs can publish the internal draft.

A debug build on a laptop does not use this keystore. Release signing is added only when Codemagic sets `CM_KEYSTORE_PATH`.
