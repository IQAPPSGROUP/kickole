# Review notes

One branch for Rob to check. Do not merge it from this note, and do not start a Codemagic or TestFlight build. `ios-testflight` does not run on push.

## What changed

- Song choice. A menu pill tap pins that song and the run starts on it. Shuffle still opens every run on Alley Beat, then rotates the other three. The pill label follows the song that is playing. A pin survives game over, mute, and returning from the background. Menu and play both hand off when a track ends. A missing file is skipped for that run, warned once, and tried again on the next run.
- In-app contact mail is hello@iqappsgroup.co.uk.
- The opening camera flyby is gone. The menu opens on the gameplay camera.
- A chosen country shows its flag beside the nickname on leaderboard rows. International shows no flag. The privacy notice is version 1.1 (26 October 2026) in `legal/privacy-notice.md` and `public/legal/index.html`. The Apple privacy manifest records that chosen country as other user content, linked to the player, not used for tracking. `supabase/migrations/20261026180000_world_board_shows_country_flag.sql` returns the country on the world board. Apply that migration before live flags can appear. The app build does not apply it.
- App version in `package.json` is 1.0.0, matching the Xcode marketing version 1.0.
- The iOS icon file is `AppIcon-1024.png`. The image is 1024×1024.
- `.ogg` song copies stay in the repo for web and Android. `npm run ios:sync` deletes them from `ios/App/App/public/audio/rob` after Capacitor copies `dist`. iPhone plays the `.m4a` files.

## How to run

```
npm ci
npm run dev
```

## How to test

```
npm run typecheck
npm test
```

There is no lint script.

`supabase/tests/leaderboard_review.sql` is a SQL editor script. It starts a transaction, clears live nicknames inside that transaction, and rolls back. Do not run it against the production project from this review.

## Open items

Clear these leaderboard rows before a public release. This branch does not delete or edit them.

Scored rows seen on the live board:

- Oasis Rabona, GB, 180
- Supersonic Rover, GB, 415
- Ember Mamba, US, 730
- Mighty Unicorn, ES, 540
- Frozen Hippo, GB, 845
- River Acrobat, GB, 1185
- Silver Bison, DE, 305
- Flame Knight, no country, 781
- Frozen Glider, GB, 1420
- Iron Meerkat, GB, 615
- Bravo Condor, IE, 960
- Platinum Corner, GB, 47

Zero-score test nicknames also still present: Turbo Striker through Turbo Striker XVII, Bronze Unicorn, Phantom Orca, Galactic Comet, Golden Nomad (AL), Golden Keeper, Oasis Groover, Phantom Striker (GB), Midnight Pirate (AL).

Delete confirmation sits in the settings dock. It is not a centred dialog. The “done” notice is centred. Leave the layout as it is for this review.

Splash images are still the Capacitor placeholder. Replace them before an external TestFlight.

Until the world-board migration is applied, production world-board calls still return no country, so live flags stay blank even though the app is ready to draw them.
