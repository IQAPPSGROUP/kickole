# World leaderboard backend plan

The live client is `createSupabaseLeaderboard`. The review migrations (`20261021120000` through `20261021120002`, plus `20261021130000_suggest_free_names.sql`) replace free-text nicknames. Players pick two words from the lists. Shuffle and Pick one for me call `suggest_free_names` so the wheels land on a pair nobody else has yet. The client also calls `peek_nickname`, `register_or_update_player`, `start_run`, `submit_score`, `get_rank`, `get_around`, `get_board`, `report_player`, `block_player`, `unblock_player`, and `delete_player`. `moderator_queue` and `resolve_report` stay off the client. See `docs/MODERATION.md`. Tables stay in the private schema. `?mockBoard=1` keeps `createMockLeaderboard` for tests and local development and does not call `suggest_free_names`.

Week is the ISO week starting Monday 00:00 UTC. Submit limits are one score per 10 seconds per device, 200 per UTC day per device and per real IP hash, at most 25 points per second of server time since `start_run`, and combo at most 3 per second plus one. A run token expires 10 minutes after `start_run`.

The notes below are the earlier sketch. Where they disagree with the migrations, the migrations win.

Checked against Supabase’s current API security docs: grants and row level security are separate layers, new `public` tables can be auto-granted to `anon`, views need `security_invoker = true` on Postgres 15+, and secret keys bypass RLS. Edge Functions still verify only the legacy JWT `anon` / `service_role` keys, so a publishable key needs `--no-verify-jwt` plus an in-function check.

## What the client sends

| Field | Role |
| --- | --- |
| `nickname` | Public label, 3–16 chars, `[A-Za-z0-9_]`, passed through the same filter as `checkNickname`. |
| `country` | Optional ISO 3166-1 alpha-2 the player picked, or null. Null means “Prefer not to say” and that row is left off every country board. |
| `score` | One integer for the run. |
| `deviceId` | Random UUID from Capacitor Preferences / local storage (`kicky.device.v1`). It is an install key, not an account, not shown, and not linked to Apple ID, Google account, email or phone. |
| `at` | Client clock, used only as a hint. The server stores its own timestamp. |

## Data minimisation

The board stores a nickname and an optional self-chosen country only. Nothing else about the person. The country is the alpha-2 code they confirm in the picker, stored on device as `kicky.country.v1` (`none` when they prefer not to say). The picker may suggest a code from the device locale region (`Intl.Locale.region`, or a trailing region subtag such as `en-GB`). It does not read GPS, IP address, timezone, or a network geolocation lookup, and the server must not fill `country` from the request IP. No precise location is collected or sent. A missing choice is not uploaded as a guess: the locale suggestion is only a default until the player saves.

No other personal data. Reinstalling the app mints a new device id. Renaming the nickname does not create an account.

## Tables

Keep the tables in a **private** schema that is not on the Data API exposed-schemas list. Enable RLS on each table and grant nothing to `anon` or `authenticated`. The Edge Function uses a secret key (`sb_secret_...`) and the `service_role`, which bypasses RLS, so RLS here is defense in depth if a grant is ever added by mistake.

```sql
create schema if not exists private;

create table private.scores (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  nickname text not null check (char_length(nickname) between 3 and 16),
  score integer not null check (score >= 0 and score <= 20000),
  kick_ups integer not null default 0 check (kick_ups >= 0),
  duration_sec integer not null check (duration_sec >= 0 and duration_sec <= 86400),
  created_at timestamptz not null default now()
);

create table private.device_best (
  device_id uuid primary key,
  nickname text not null,
  country char(2),
  best_score integer not null,
  week_score integer not null,
  week_start date not null,
  updated_at timestamptz not null default now(),
  constraint device_best_country_iso check (country is null or country ~ '^[A-Z]{2}$')
);

create table private.nickname_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_device_id uuid not null,
  target_nickname text not null,
  created_at timestamptz not null default now()
);

create table private.blocks (
  device_id uuid not null,
  blocked_nickname text not null,
  created_at timestamptz not null default now(),
  primary key (device_id, blocked_nickname)
);

create table private.submit_log (
  device_id uuid not null,
  created_at timestamptz not null default now()
);

alter table private.scores enable row level security;
alter table private.device_best enable row level security;
alter table private.nickname_reports enable row level security;
alter table private.blocks enable row level security;
alter table private.submit_log enable row level security;
```

`device_best.country` is null when the player prefers not to say. Those rows are excluded from country boards. Do not add a latitude, longitude, city, IP, or any other location column. The audit table `private.scores` does not store a location either.

Do not add a policy that treats a client-supplied device id as `auth.uid()`. Anyone could send someone else’s id. There is no Supabase Auth user for this board.

Revoke the default Data API grants if this project still auto-grants `anon` (see “Securing your API”):

```sql
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
```

## Edge Function `submit-score`

The app calls one function. It does not insert into Postgres itself.

1. Reject the request unless the publishable key (or legacy `anon` JWT) matches this project. Do not put the secret key in the app, the repo, or a `VITE_` variable.
2. Re-run the nickname rules on the server (length, charset, email, phone, URL, profanity, real-name heuristic). The client filter is not the control. Accept `country` only when it is null or an alpha-2 code on the server’s ISO 3166-1 list. Reject anything else. Do not derive a country from the client IP, a timezone, or a location API.
3. Plausibility, using the shipped scoring table (a touch is at most a few dozen points; around-the-world is 20 before the streak multiplier):
   - `score <= 20000`
   - `score <= kick_ups * 40`
   - `score <= duration_sec * 40`
   - `duration_sec` at least `score / 40`
4. Rate limit from `private.submit_log`: at most one accepted submit per device per 15 seconds, and 40 per UTC day. Return 429 after that.
5. Upsert `private.device_best` only when the score beats the stored all-time best, and the same for the UTC week. Ignore a lower score. That keeps one row per install on the public board.
6. Write a `private.scores` audit row for the plausibility trail. Do not return `device_id` to the client.

## Edge Function `leaderboard`

Returns nickname, score, rank, and the country code (so the client can show a flag). No coordinates.

- `scope=world` reads `device_best.best_score`. `scope=week` reads rows whose `week_start` is the current UTC week. `scope=country` reads rows whose `country` equals the caller’s non-null code. A null country is excluded from that scope, and the client shows that they chose not to appear.
- `around` returns the caller’s row plus three above and three below. `top` returns 10.
- Drop nicknames this device has blocked, and nicknames with an unresolved report over the moderation threshold (start at 3 distinct reporters).
- Cache the top 10 for a short TTL. Do not stream the whole table to the phone.

## Reports, blocks, and Apple guideline 1.2

User-generated nicknames are UGC. Before the backend is turned on, the build needs all four of Apple’s guideline 1.2 controls:

| Control | Client today | Server when live |
| --- | --- | --- |
| Filter | `checkNickname` blocks profanity, emails, phones, URLs and a real-name heuristic | Same rules again inside `submit-score`, plus a server list that can be updated without an app release |
| Report | Game-over **Report** records the nickname | Insert `private.nickname_reports`. A monitored inbox reviews the queue within 24 hours |
| Block | Report also hides that nickname on this device | `private.blocks` is applied in `leaderboard` for that device id |
| Contact | Not published yet | Show a monitored IQ Apps Group support address on the board and in App Store Connect |

The local mock already filters, and Report hides the name on this device. It does not contact a server.

## Privacy notice

Settings and `docs/STORE_DATA_SAFETY.md` describe the live board. Use the same wording in the App Store / Play Data safety forms. Proposed wording:

> The leaderboard is off until you tap Join leaderboard. If you join, Kickolé stores a nickname picked from our word lists and a random device id on this device. You can also choose a country, or prefer not to say. We send that nickname, your score, the device id, and the country you chose (if any) to our scoreboard so other players can see your tag, flag and score. We do not use GPS or a network lookup to pick your country. A hashed IP address may be kept for 30 days to limit cheating. Choosing “Prefer not to say” keeps you off country boards. You can change the nickname once every 7 days. Delete my leaderboard data removes your nickname and scores. If someone has reported you, we keep that report for up to 90 days. We do not use the board for advertising.

Also declare, when it ships: gameplay scores transmitted for app functionality, not tracking; no account; nickname is user-generated content.
