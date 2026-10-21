-- KICKOLÉ leaderboard: private tables (not exposed via Data API)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create table private.players (
  id uuid primary key,                     -- random install id from device, not an account
  nickname text not null
    constraint players_nickname_format check (char_length(nickname) between 3 and 16 and nickname ~ '^[A-Za-z0-9_]+$'),
  country char(2) constraint players_country_iso check (country is null or country ~ '^[A-Z]{2}$'),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index players_nickname_ci_key on private.players (lower(nickname));
create index players_country_idx on private.players (country) where country is not null;

create table private.scores (
  id bigint generated always as identity primary key,
  player_id uuid not null references private.players(id) on delete cascade,
  score integer not null check (score >= 0),
  combo integer not null default 0 check (combo >= 0),
  run_duration_ms integer not null check (run_duration_ms > 0),
  created_at timestamptz not null default now()
);
create index scores_player_created_idx on private.scores (player_id, created_at desc);

-- One row per player: all-time best + best in current ISO week (UTC). Fast ranking.
create table private.player_best (
  player_id uuid primary key references private.players(id) on delete cascade,
  best_score integer not null,
  best_at timestamptz not null,
  week_start date not null,
  week_score integer not null,
  week_at timestamptz not null
);
create index player_best_all_idx on private.player_best (best_score desc, best_at);
create index player_best_week_idx on private.player_best (week_start, week_score desc, week_at);

create table private.reports (
  id bigint generated always as identity primary key,
  reporter_player_id uuid not null references private.players(id) on delete cascade,
  reported_player_id uuid not null references private.players(id) on delete cascade,
  reported_nickname text not null,
  reason text check (reason is null or char_length(reason) <= 200),
  status text not null default 'pending' check (status in ('pending','upheld','dismissed','superseded')),
  created_at timestamptz not null default now(),
  constraint reports_not_self check (reporter_player_id <> reported_player_id)
);
create unique index reports_one_pending_per_pair on private.reports (reporter_player_id, reported_player_id) where status = 'pending';
create index reports_reported_status_idx on private.reports (reported_player_id, status);

create table private.blocks (
  player_id uuid not null references private.players(id) on delete cascade,
  blocked_player_id uuid not null references private.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (player_id, blocked_player_id)
);
create index blocks_blocked_idx on private.blocks (blocked_player_id);

create table private.blocked_words (
  word text primary key check (word = lower(word)),
  match_mode text not null default 'contains' check (match_mode in ('contains','exact'))
);

alter table private.players enable row level security;
alter table private.scores enable row level security;
alter table private.player_best enable row level security;
alter table private.reports enable row level security;
alter table private.blocks enable row level security;
alter table private.blocked_words enable row level security;
-- No policies and no grants to anon/authenticated: access only via security-definer RPCs.

insert into private.blocked_words (word, match_mode) values
 ('fuck','contains'),('shit','contains'),('cunt','contains'),('bitch','contains'),('bastard','contains'),
 ('wank','contains'),('twat','contains'),('bollock','contains'),('pussy','contains'),('penis','contains'),
 ('vagina','contains'),('dick','contains'),('cock','contains'),('slut','contains'),('whore','contains'),
 ('nigg','contains'),('nigga','contains'),('fag','contains'),('retard','contains'),('spastic','contains'),
 ('paki','contains'),('chink','contains'),('kike','contains'),('spic','contains'),('tranny','contains'),
 ('rape','contains'),('rapist','contains'),('nazi','contains'),('hitler','contains'),('porn','contains'),
 ('sex','contains'),('dildo','contains'),('boob','contains'),('tits','contains'),('anal','contains'),
 ('pedo','contains'),('paedo','contains'),('incest','contains'),('jizz','contains'),('cum','exact'),
 ('ass','exact'),('arse','contains'),('asshole','contains'),('piss','contains'),('crap','exact'),
 ('prick','contains'),('knob','contains'),('bellend','contains'),('wanker','contains'),('motherf','contains'),
 ('kkk','contains'),('isis','exact'),('suicide','contains'),('killyourself','contains'),('kys','exact'),
 ('admin','contains'),('moderator','contains'),('kickole','contains'),('support','exact'),('official','contains'),
 ('iqapps','contains')
on conflict do nothing;
