# World leaderboard backend plan

The app already has the client: a nickname on the device, a live rank tag, and the game-over board. Scores are **not** uploaded. `createMockLeaderboard` in `src/game/leaderboard.ts` implements `LeaderboardService`. A later Supabase client should implement that same interface and leave the UI alone.

Checked against Supabase’s current API security docs: grants and row level security are separate layers, new `public` tables can be auto-granted to `anon`, views need `security_invoker = true` on Postgres 15+, and secret keys bypass RLS. Edge Functions still verify only the legacy JWT `anon` / `service_role` keys, so a publishable key needs `--no-verify-jwt` plus an in-function check.

## What the client sends

| Field | Role |
| --- | --- |
| `nickname` | Public label, 3–16 chars, `[A-Za-z0-9_]`, passed through the same filter as `checkNickname`. |
| `score` | One integer for the run. |
| `deviceId` | Random UUID from Capacitor Preferences / local storage (`kicky.device.v1`). It is an install key, not an account, not shown, and not linked to Apple ID, Google account, email or phone. |
| `at` | Client clock, used only as a hint. The server stores its own timestamp. |

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
  best_score integer not null,
  week_score integer not null,
  week_start date not null,
  updated_at timestamptz not null default now()
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

Do not add a policy that treats a client-supplied device id as `auth.uid()`. Anyone could send someone else’s id. There is no Supabase Auth user for this board.

Revoke the default Data API grants if this project still auto-grants `anon` (see “Securing your API”):

```sql
alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
```

## Edge Function `submit-score`

The app calls one function. It does not insert into Postgres itself.

1. Reject the request unless the publishable key (or legacy `anon` JWT) matches this project. Do not put the secret key in the app, the repo, or a `VITE_` variable.
2. Re-run the nickname rules on the server (length, charset, email, phone, URL, profanity, real-name heuristic). The client filter is not the control.
3. Plausibility, using the shipped scoring table (a touch is at most a few dozen points; around-the-world is 20 before the streak multiplier):
   - `score <= 20000`
   - `score <= kick_ups * 40`
   - `score <= duration_sec * 40`
   - `duration_sec` at least `score / 40`
4. Rate limit from `private.submit_log`: at most one accepted submit per device per 15 seconds, and 40 per UTC day. Return 429 after that.
5. Upsert `private.device_best` only when the score beats the stored all-time best, and the same for the UTC week. Ignore a lower score. That keeps one row per install on the public board.
6. Write a `private.scores` audit row for the plausibility trail. Do not return `device_id` to the client.

## Edge Function `leaderboard`

Returns nickname, score and rank only.

- `scope=world` reads `device_best.best_score`. `scope=week` reads rows whose `week_start` is the current UTC week.
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

## Privacy notice to add before upload

The Settings copy currently says scores stay on the device. That sentence has to change in the app, in `docs/STORE_DATA_SAFETY.md`, and in the App Store / Play Data safety forms **before** `submit-score` is called from a release build. Proposed wording:

> Kickolé stores a nickname you choose and a random device id on this device. If you play online, we send that nickname, your score and the device id to our scoreboard so other players can see your tag and score. We do not ask for your real name, email, phone number or contacts. The device id is not your Apple or Google account. You can change the nickname in Settings. Uninstalling the app removes it from this device; ask the support address on the leaderboard to remove a score from the public board. We do not use the board for advertising.

Also declare, when it ships: gameplay scores transmitted for app functionality, not tracking; no account; nickname is user-generated content.
