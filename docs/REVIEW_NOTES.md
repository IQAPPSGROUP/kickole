# Review notes

One branch for Rob to check. Do not merge it from this note, and do not start a Codemagic or TestFlight build. `ios-testflight` does not run on push.

## What changed

- Song choice. A menu pill tap pins that song and the run starts on it. Shuffle still opens every run on Alley Beat, then rotates the other three. The pill label follows the song that is playing. A pin survives game over, mute, and returning from the background. Menu and play both hand off when a track ends. A missing file is skipped for that run, warned once, and tried again on the next run.
- In-app contact mail is hello@iqappsgroup.co.uk.
- The opening camera flyby is gone. The menu opens on the gameplay camera.
- A chosen country shows its flag beside the nickname on the world board and on country boards, for every time frame. International shows no flag. The first-run country question reads: “Optional. The flag of the country you choose is shown to everyone beside your nickname.”
- The privacy notice is the final version 1.1 (26 October 2026, replaces version 1.0). Settings, `legal/privacy-notice.md`, and the privacy section of `public/legal/index.html` are the same text. The notice says a leaderboard appears only once it has 20 or more players. That now matches the app: every world time frame and every country board stays hidden until that period has 20 scored players. Under 20 the sheet says “Leaderboard appears once 20 players have scored” and does not list names or a count. The notice wording was not changed.
- The same 20-player rule is in `supabase/migrations/20261026180000_world_board_shows_country_flag.sql` for `get_board`, `get_around`, and `get_rank`. A hidden board returns no nicknames. `get_rank` returns no place and no total under 20, so the count is not in that payload either. That migration is applied on the live Supabase project (fjcidkbwxjimvxwzaoct), verified 26 October 2026 at 22:10: `get_board('all','world',null,50,null)` returns `{"rows":[],"hidden":true}`. The live project has 26 named players, 2 of them with scores. The installed app hides the all-time world rank when `get_rank` reports a total under 20, and hides any period whose `get_board` payload says `hidden`.
- The Apple privacy manifest collects Name (nickname), User ID (the random install id `kicky.device.v1`), Gameplay content (score), and Other user content (chosen country). Each is linked to the player, for app functionality only, and not used for tracking. Device ID was removed because it was that same install id, not a separate hardware or advertising id. There is one flag migration, `supabase/migrations/20261026180000_world_board_shows_country_flag.sql`. It is applied on the live project, so a shown world board can include flags and a world board under 20 stays hidden on the server. The app build does not apply migrations. Pull request #47 is superseded by this branch.
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

Sample leaderboard players are cleared. 26 real or test installs remain on the live project, 2 of them with scores. This branch does not delete or edit those rows.

`supabase/migrations/20261026230000_purge_ip_hashes_at_30_days.sql` is in this branch and is not applied. It stays unapplied until Lee has word-checked the SQL. It does not run `purge_leaderboard()` itself. The existing daily cron is unchanged.

Delete confirmation sits in the settings dock. It is not a centred dialog. The “done” notice is centred. Leave the layout as it is for this review.

Splash images in `ios/App/App/Assets.xcassets/Splash.imageset` are Graham’s approved launch screens. Each file is 2732×2732 and replaces the Capacitor placeholder. `Contents.json` is unchanged.

The world-board migration is applied. Live world-board calls follow the 20-player hide, and a shown board can include the chosen country flag.
