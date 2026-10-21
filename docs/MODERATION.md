# Leaderboard moderation

Player nicknames come from the word lists in `private.nickname_words`. Players do not type a free-text name. Reports, blocks, hides, and bans still apply, and a hide stays on the player row when they rename.

## What players can do

- **Report** and **Block** sit behind the `⋯` button on a board row. Report asks for confirmation. Block hides that nickname on this device immediately.
- A report also blocks the nickname for the reporter.
- A report counts toward the public queue only when the reporter's row is at least 24 hours old, they have at least one accepted score, and they are under the daily cap (5 counted reports per UTC day, plus the hashed-IP limit). The client is not told whether a report counted.
- Three distinct pending reporters hide the nickname automatically.
- Settings lists blocked nicknames and can unblock them.
- `block_player` and `unblock_player` both require a live device id. A missing or deleted device returns `unknown_player`. Each has its own counters: 40 calls per device per 10 minutes and 80 calls per hashed IP per 10 minutes. Over that RPC's budget the call returns `rate_limited` and does not change blocks. A missing nickname still returns a generic `{ok:true}`.
- **Delete my leaderboard data** calls `delete_player`. That removes the nickname, scores, bests, and reports or blocks this player filed. If a report or moderation record exists against them, the player row stays as a tombstone with the nickname cleared. `private.purge_leaderboard()` drops settled reports and moderation log rows after 90 days, then removes the tombstone.

## Moderator functions

These are not granted to `anon` or `authenticated`. Run them in the Supabase SQL editor as `postgres` (or another role you grant yourself). Do not put them in the client.

```sql
select * from public.moderator_queue();

select public.resolve_report(<report_id>, 'dismiss'); -- pending cleared; unhide if nothing else is pending and they are not banned
select public.resolve_report(<report_id>, 'hide');    -- nickname stays hidden
select public.resolve_report(<report_id>, 'ban');     -- hidden and banned; scores and renames stop
```

Each resolve writes `private.moderation_log` with the action, the report id, and the player id.

## Retention

`private.purge_leaderboard()` is scheduled daily at 03:15 UTC. The migration raises if `pg_cron` is unavailable:

- raw `private.scores` older than 12 months
- settled reports (`upheld`, `dismissed`, `superseded`) and moderation log rows older than 90 days. Open reports stay.
- hashed IP rate-limit rows older than 30 days
- run tokens older than 7 days
- players with no play for 2 years (bests go with them; a player who still has a report becomes a tombstone until that report ages out)

The IP hash uses `private.app_secrets.ip_hash_salt`. The migration creates that salt with `gen_random_bytes` when the row is missing. The hash reads only `cf-connecting-ip`. When that header is absent, rate limits share an `unknown` bucket and no address is stored on the player.
