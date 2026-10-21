-- Commit only. Apply on the kickole project by hand after 20261021150000.
-- Score cap uses the server clock. IP salt is created in the database.
-- World rows hide a country until that country has 20 players on the same board.
-- Block and report do not say whether the name exists.

insert into private.app_secrets (key, value)
values ('ip_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

alter table private.players add column if not exists ip_hash text;
create index if not exists players_ip_hash_idx on private.players (ip_hash) where ip_hash is not null;

alter table private.scores add column if not exists ip_hash text;
create index if not exists scores_ip_hash_idx on private.scores (ip_hash, created_at desc) where ip_hash is not null;

alter table private.reports add column if not exists ip_hash text;
create index if not exists reports_ip_hash_idx on private.reports (ip_hash, created_at desc) where ip_hash is not null;

create or replace function private.client_ip()
returns text language plpgsql stable set search_path = '' as $$
declare
  headers json;
  raw text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  if headers is null then return null; end if;
  raw := headers->>'cf-connecting-ip';
  if raw is null or btrim(raw) = '' then return null; end if;
  return nullif(btrim(raw), '');
end $$;

create or replace function private.ip_hash()
returns text language plpgsql volatile set search_path = '' as $$
declare
  salt text;
  ip text := coalesce(private.client_ip(), 'unknown');
begin
  select s.value into salt from private.app_secrets s where s.key = 'ip_hash_salt';
  if salt is null or btrim(salt) = '' then
    insert into private.app_secrets (key, value)
    values ('ip_hash_salt', encode(extensions.gen_random_bytes(32), 'hex'))
    on conflict (key) do nothing;
    select s.value into salt from private.app_secrets s where s.key = 'ip_hash_salt';
  end if;
  if salt is null or btrim(salt) = '' then return null; end if;
  return encode(extensions.digest(convert_to(salt || ':' || ip, 'UTF8'), 'sha256'), 'hex');
end $$;

-- True when this caller is over the limit. A missing hash fails closed.
-- Header-less callers share the 'unknown' bucket.
create or replace function private.bump_limit(p_action text, p_device uuid, p_max integer, p_window interval, p_use_ip boolean)
returns boolean language plpgsql volatile set search_path = '' as $$
declare
  hashed text;
  seen integer;
begin
  if p_use_ip then
    hashed := private.ip_hash();
    if hashed is null then return true; end if;
    insert into private.rate_limits (ip_hash, action) values (hashed, p_action);
    select count(*) into seen from private.rate_limits r
    where r.ip_hash = hashed and r.action = p_action and r.created_at > now() - p_window;
  else
    if p_device is null then return true; end if;
    insert into private.rate_limits (device_id, action) values (p_device, p_action);
    select count(*) into seen from private.rate_limits r
    where r.device_id = p_device and r.action = p_action and r.created_at > now() - p_window;
  end if;
  return seen > p_max;
end $$;

create or replace function private.remember_ip(p_device uuid)
returns void language plpgsql volatile set search_path = '' as $$
begin
  if p_device is null or private.client_ip() is null then return; end if;
  update private.players set ip_hash = private.ip_hash() where id = p_device;
end $$;

create or replace function private.banned_ip()
returns boolean language plpgsql volatile set search_path = '' as $$
begin
  if private.client_ip() is null then return false; end if;
  return exists (
    select 1 from private.players p
    where p.banned and p.ip_hash is not null and p.ip_hash = private.ip_hash()
  );
end $$;

-- FNV-1a, matching src/game/runProof.ts. Low 32 bits, lowercase hex.
create or replace function private.run_checksum(
  p_device uuid,
  p_token uuid,
  p_score integer,
  p_kicks integer,
  p_duration integer,
  p_times text
)
returns text language plpgsql immutable set search_path = '' as $$
declare
  payload text := lower(p_device::text) || '|' || lower(p_token::text) || '|' || p_score::text
    || '|' || p_kicks::text || '|' || p_duration::text || '|' || coalesce(p_times, '');
  hash bigint := 2166136261;
  i integer;
  c integer;
begin
  for i in 1 .. char_length(payload) loop
    c := ascii(substr(payload, i, 1));
    hash := (hash # c) & 4294967295;
    hash := (hash * 16777619) & 4294967295;
  end loop;
  return lpad(to_hex(hash), 8, '0');
end $$;

create or replace function private.kick_proof_ok(
  p_device uuid,
  p_token uuid,
  p_score integer,
  p_duration integer,
  p_elapsed_ms numeric,
  p_kick_count integer,
  p_kick_times text,
  p_kick_checksum text
)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  part text;
  prev integer := -1;
  stamp integer;
  seen integer := 0;
  secs numeric := greatest(p_elapsed_ms, 1) / 1000.0;
begin
  if p_kick_count is null and p_kick_times is null and p_kick_checksum is null then
    return true;
  end if;
  if p_kick_count is null or p_kick_times is null or p_kick_checksum is null then
    return false;
  end if;
  if p_kick_count < 0 or p_kick_count > ceil(secs * 5) + 1 then return false; end if;
  if p_score > 0 and p_kick_count < 1 then return false; end if;
  if char_length(p_kick_times) > 8000 then return false; end if;
  if p_kick_count = 0 then
    if btrim(p_kick_times) <> '' then return false; end if;
  else
    foreach part in array string_to_array(p_kick_times, ',') loop
      if part !~ '^[0-9]{1,8}$' then return false; end if;
      stamp := part::integer;
      if stamp < prev or stamp > ceil(p_elapsed_ms) + 5000 then return false; end if;
      prev := stamp;
      seen := seen + 1;
    end loop;
    if seen <> p_kick_count then return false; end if;
  end if;
  return p_kick_checksum = private.run_checksum(p_device, p_token, p_score, p_kick_count, p_duration, p_kick_times);
end $$;

revoke all on function private.remember_ip(uuid) from public, anon, authenticated;
revoke all on function private.banned_ip() from public, anon, authenticated;
revoke all on function private.run_checksum(uuid, uuid, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function private.kick_proof_ok(uuid, uuid, integer, integer, numeric, integer, text, text) from public, anon, authenticated;

create or replace function private.shown_country(p_period text, p_country text)
returns text language sql stable set search_path = '' as $$
  select case
    when p_country is null or btrim(p_country) = '' then null
    when (
      select count(*) from private.ranked_board(p_period, 'country', btrim(p_country))
    ) >= 20 then btrim(p_country)
    else null
  end
$$;

revoke all on function private.shown_country(text, text) from public, anon, authenticated;

create or replace function public.register_or_update_player(device_id uuid, adjective text, noun text, country text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  adj text := private.lookup_word('adjective', adjective);
  noun_word text := private.lookup_word('noun', noun);
  base text;
  c text := nullif(upper(btrim(country)), '');
  existing text;
  existing_base text;
  renamed timestamptz;
  is_banned boolean := false;
  found record;
  is_rename boolean := false;
begin
  if device_id is null then
    raise exception 'device_id_required' using errcode = '22023';
  end if;
  if adj is null or noun_word is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in_list');
  end if;
  if c is not null and not exists (select 1 from private.countries where code = c) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_country');
  end if;
  base := adj || ' ' || noun_word;
  select p.nickname, p.renamed_at, p.banned into existing, renamed, is_banned
  from private.players p where p.id = device_id;
  if is_banned or private.banned_ip() then
    return jsonb_build_object('ok', false, 'reason', 'banned');
  end if;
  existing_base := case
    when existing is null then null
    else regexp_replace(existing, ' [IVXLCDM]+$', '')
  end;
  if private.is_blocked_pair(adj, noun_word)
     and (existing_base is null or lower(existing_base) <> lower(base)) then
    return jsonb_build_object('ok', false, 'reason', 'blocked_pair');
  end if;
  if existing is not null and lower(existing_base) = lower(base) then
    update private.players
      set country = c, updated_at = now(), deleted_at = null
      where id = device_id;
    perform private.remember_ip(device_id);
    return jsonb_build_object('ok', true, 'nickname', existing, 'country', c, 'taken', false);
  end if;
  if existing is not null and renamed is not null and renamed > now() - interval '7 days' then
    return jsonb_build_object('ok', false, 'reason', 'rename_limit');
  end if;
  if private.bump_limit('register', device_id, 20, interval '1 day', false)
     or private.bump_limit('register-ip', null, 40, interval '1 hour', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  select * into found from private.next_nickname(device_id, base);
  if found.nickname is null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  is_rename := existing is not null;
  begin
    insert into private.players (id, nickname, country)
    values (device_id, found.nickname, c)
    on conflict (id) do update
      set nickname = excluded.nickname,
          country = excluded.country,
          updated_at = now(),
          deleted_at = null,
          renamed_at = case when is_rename then now() else private.players.renamed_at end;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;
  perform private.remember_ip(device_id);
  return jsonb_build_object('ok', true, 'nickname', found.nickname, 'country', c, 'taken', found.taken);
end $$;

create or replace function public.start_run(device_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  token uuid := gen_random_uuid();
  is_banned boolean := false;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  select p.banned into is_banned from private.players p where p.id = device_id;
  if is_banned or private.banned_ip() then
    return jsonb_build_object('ok', false, 'reason', 'banned');
  end if;
  if private.bump_limit('start_run', device_id, 120, interval '1 hour', false)
     or private.bump_limit('start_run-ip', null, 240, interval '1 hour', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into private.run_tokens (token, player_id) values (token, device_id);
  perform private.remember_ip(device_id);
  return jsonb_build_object('ok', true, 'token', token);
end $$;

drop function if exists public.submit_score(uuid, integer, integer, integer, uuid);

create or replace function public.submit_score(
  device_id uuid,
  score integer,
  combo integer,
  run_duration_ms integer,
  run_token uuid,
  kick_count integer default null,
  kick_times text default null,
  kick_checksum text default null
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tok private.run_tokens%rowtype;
  elapsed_ms numeric;
  secs numeric;
  last_at timestamptz;
  today_count integer;
  ip_today integer;
  wk date := private.week_start();
  pb private.player_best%rowtype;
  new_best boolean := false;
  new_week boolean := false;
  is_banned boolean := false;
  stored_ip text;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null) then
    return jsonb_build_object('accepted', false, 'reason', 'unknown_player');
  end if;
  select p.banned into is_banned from private.players p where p.id = device_id;
  if is_banned or private.banned_ip() then
    return jsonb_build_object('accepted', false, 'reason', 'banned');
  end if;
  if score is null or combo is null or run_duration_ms is null or run_token is null
     or score < 0 or combo < 0 or run_duration_ms <= 0 or run_duration_ms > 600000 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  select * into tok from private.run_tokens t
  where t.token = run_token and t.player_id = device_id
  for update;
  if not found or tok.used_at is not null or tok.created_at < now() - interval '10 minutes' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;
  elapsed_ms := extract(epoch from (now() - tok.created_at)) * 1000;
  if elapsed_ms < 1 then elapsed_ms := 1; end if;
  if run_duration_ms > elapsed_ms + 5000 then
    update private.run_tokens set used_at = now() where token = run_token;
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  secs := elapsed_ms / 1000.0;
  if score > 20000 or score > ceil(secs * 25) or combo > ceil(secs * 3) + 1
     or not private.kick_proof_ok(device_id, run_token, score, run_duration_ms, elapsed_ms, kick_count, kick_times, kick_checksum) then
    update private.run_tokens set used_at = now() where token = run_token;
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  if private.bump_limit('submit-ip', null, 120, interval '1 hour', true) then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(device_id::text, 0));
  select max(s.created_at),
         count(*) filter (where s.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
    into last_at, today_count
  from private.scores s
  where s.player_id = device_id and s.created_at > now() - interval '1 day';
  if last_at is not null and last_at > now() - interval '10 seconds' then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited');
  end if;
  if today_count >= 200 then
    return jsonb_build_object('accepted', false, 'reason', 'daily_limit');
  end if;
  if private.client_ip() is not null then
    select count(*) into ip_today from private.scores s
    where s.ip_hash = private.ip_hash()
      and s.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    if ip_today >= 200 then
      return jsonb_build_object('accepted', false, 'reason', 'daily_limit');
    end if;
    stored_ip := private.ip_hash();
  end if;

  update private.run_tokens set used_at = now() where token = run_token;
  insert into private.scores (player_id, score, combo, run_duration_ms, ip_hash)
  values (device_id, score, combo, run_duration_ms, stored_ip);
  update private.players set last_played_at = now(), updated_at = now() where id = device_id;
  perform private.remember_ip(device_id);

  perform private.keep_period_best(device_id, 'day', score);
  perform private.keep_period_best(device_id, 'week', score);
  perform private.keep_period_best(device_id, 'month', score);
  perform private.keep_period_best(device_id, 'year', score);
  perform private.keep_period_best(device_id, 'all', score);

  select * into pb from private.player_best where player_id = device_id for update;
  if not found then
    insert into private.player_best values (device_id, score, now(), wk, score, now());
    new_best := true;
    new_week := true;
  else
    if score > pb.best_score then
      pb.best_score := score;
      pb.best_at := now();
      new_best := true;
    end if;
    if pb.week_start <> wk then
      pb.week_start := wk;
      pb.week_score := score;
      pb.week_at := now();
      new_week := true;
    elsif score > pb.week_score then
      pb.week_score := score;
      pb.week_at := now();
      new_week := true;
    end if;
    update private.player_best
      set best_score = pb.best_score, best_at = pb.best_at, week_start = pb.week_start,
          week_score = pb.week_score, week_at = pb.week_at
      where player_id = device_id;
  end if;
  select * into pb from private.player_best where player_id = device_id;
  return jsonb_build_object(
    'accepted', true,
    'best', pb.best_score,
    'week_best', pb.week_score,
    'new_best', new_best,
    'new_week_best', new_week
  );
end $$;

revoke all on function public.submit_score(uuid, integer, integer, integer, uuid, integer, text, text) from public;
grant execute on function public.submit_score(uuid, integer, integer, integer, uuid, integer, text, text) to anon, authenticated;

create or replace function public.get_around(
  device_id uuid,
  period text default 'all',
  scope text default 'world',
  n integer default 3
)
returns table (rank bigint, nickname text, country text, score integer, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me private.players%rowtype;
  nn int := least(greatest(coalesce(n, 3), 0), 10);
  country_count bigint;
  board_country text;
begin
  perform private.check_args(scope, period);
  select * into me from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null;
  if not found or me.hidden or me.banned then return; end if;
  board_country := btrim(me.country::text);
  if scope = 'country' then
    if me.country is null then return; end if;
    select count(*) into country_count from private.ranked_board(period, 'country', board_country);
    if coalesce(country_count, 0) < 20 then return; end if;
  end if;
  return query
  with b as (
    select bd.* from private.ranked_board(period, scope, board_country) bd
    where bd.player_id = me.id
       or not exists (
         select 1 from private.blocks bl
         where bl.player_id = me.id and bl.blocked_player_id = bd.player_id
       )
  ),
  r as (select b.*, row_number() over (order by b.pos) as vpos from b),
  m as (select r.vpos from r where r.player_id = me.id)
  select r.rank, r.nickname,
         case when scope = 'world' then private.shown_country(period, r.country) else r.country end,
         r.score, r.player_id = me.id
  from r, m
  where r.vpos between m.vpos - nn and m.vpos + nn
  order by r.vpos;
end $$;

create or replace function public.get_board(
  period text,
  scope text,
  country text default null,
  lim integer default 10,
  device_id uuid default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  c text := nullif(upper(btrim(country)), '');
  country_count bigint;
  rows jsonb;
begin
  perform private.check_args(scope, period);
  if scope = 'country' and c is null and device_id is not null then
    select btrim(p.country::text) into c from private.players p where p.id = device_id;
  end if;
  if scope = 'country' and c is null then
    return jsonb_build_object('hidden', false, 'rows', '[]'::jsonb);
  end if;
  if scope = 'country' then
    select count(*) into country_count from private.ranked_board(period, 'country', c);
    if coalesce(country_count, 0) < 20 then
      return jsonb_build_object('hidden', true, 'rows', '[]'::jsonb);
    end if;
  end if;
  select coalesce(jsonb_agg(item.row order by item.pos), '[]'::jsonb) into rows
  from (
    select bd.pos,
           jsonb_build_object(
             'rank', bd.rank,
             'nickname', bd.nickname,
             'country', case
               when scope = 'world' then private.shown_country(period, bd.country)
               else bd.country
             end,
             'score', bd.score,
             'mine', coalesce(bd.player_id = device_id, false)
           ) as row
    from private.ranked_board(period, scope, c) bd
    where device_id is null
       or bd.player_id = device_id
       or not exists (
         select 1 from private.blocks bl
         where bl.player_id = device_id and bl.blocked_player_id = bd.player_id
       )
    order by bd.pos
    limit least(greatest(coalesce(lim, 10), 1), 50)
  ) item;
  return jsonb_build_object('hidden', false, 'rows', rows);
end $$;

create or replace function public.block_player(device_id uuid, blocked_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  select p.id into target from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(blocked_nickname);
  if target is null or target = device_id then
    return jsonb_build_object('ok', true);
  end if;
  insert into private.blocks (player_id, blocked_player_id) values (device_id, target)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.report_player(reporter_device_id uuid, reported_nickname text, reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  reporter private.players%rowtype;
  target uuid;
  tnick text;
  counts boolean := false;
  today_reports integer := 0;
  ip_reports integer := 0;
  pending_count integer := 0;
  stored_ip text;
begin
  select * into reporter from private.players p where p.id = reporter_device_id and p.deleted_at is null and p.nickname is not null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  if reporter.banned or private.banned_ip() then
    return jsonb_build_object('ok', true);
  end if;
  select p.id, p.nickname into target, tnick from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(reported_nickname);
  if target is null or target = reporter_device_id then
    return jsonb_build_object('ok', true);
  end if;
  insert into private.blocks (player_id, blocked_player_id) values (reporter_device_id, target)
  on conflict do nothing;
  if private.client_ip() is not null then
    stored_ip := private.ip_hash();
    select count(*) into ip_reports from private.reports r
    where r.ip_hash = stored_ip
      and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  end if;
  if not private.bump_limit('report-ip', null, 30, interval '1 day', true) then
    select count(*) into today_reports from private.reports r
    where r.reporter_player_id = reporter_device_id
      and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    counts := reporter.created_at <= now() - interval '24 hours'
      and exists (select 1 from private.scores s where s.player_id = reporter_device_id)
      and today_reports < 5
      and (stored_ip is null or ip_reports < 5);
    if counts then
      insert into private.reports (reporter_player_id, reported_player_id, reported_nickname, reason, ip_hash)
      values (reporter_device_id, target, tnick, left(reason, 200), stored_ip)
      on conflict (reporter_player_id, reported_player_id) where status = 'pending' do nothing;
      select count(distinct r.reporter_player_id) into pending_count
      from private.reports r
      where r.reported_player_id = target and r.status = 'pending';
      if pending_count >= 3 then
        update private.players set hidden = true, updated_at = now() where id = target and not hidden;
      end if;
    end if;
  end if;
  return jsonb_build_object('ok', true);
end $$;
