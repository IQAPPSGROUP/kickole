-- KICKOLÉ leaderboard review RPCs. Commit only — apply after 20261021120000.
-- Replaces free-text nicknames, adds periods, run tokens, deletes, and moderator functions.
-- moderator_queue and resolve_report are NOT granted to anon or authenticated.

drop function if exists public.check_nickname(text, uuid);
drop function if exists public.register_or_update_player(uuid, text, text);
drop function if exists public.submit_score(uuid, integer, integer, integer);
drop function if exists public.get_rank(uuid, text, text);
drop function if exists public.get_around(uuid, text, text, integer);
drop function if exists public.get_top(text, text, text, integer, uuid);
drop function if exists public.block_player(uuid, text);
drop function if exists public.report_player(uuid, text, text);

create or replace function private.roman_numeral(n integer)
returns text language plpgsql immutable set search_path = '' as $$
declare
  amounts int[] := array[40, 10, 9, 5, 4, 1];
  glyphs text[] := array['XL', 'X', 'IX', 'V', 'IV', 'I'];
  i int;
  left_n int := n;
  out text := '';
begin
  if left_n is null or left_n < 1 or left_n > 40 then return null; end if;
  for i in 1..array_length(amounts, 1) loop
    while left_n >= amounts[i] loop
      out := out || glyphs[i];
      left_n := left_n - amounts[i];
    end loop;
  end loop;
  return out;
end $$;

create or replace function private.period_start(p_period text, ts timestamptz default now())
returns date language sql stable set search_path = '' as $$
  select case p_period
    when 'day' then (ts at time zone 'UTC')::date
    when 'week' then private.week_start(ts)
    when 'month' then date_trunc('month', ts at time zone 'UTC')::date
    when 'year' then date_trunc('year', ts at time zone 'UTC')::date
    when 'all' then date '1970-01-01'
    else null
  end
$$;

create or replace function private.check_args(p_scope text, p_period text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_scope not in ('world', 'country') then
    raise exception 'invalid_scope' using errcode = '22023';
  end if;
  if p_period not in ('day', 'week', 'month', 'year', 'all') then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
end $$;

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
  raw := coalesce(headers->>'cf-connecting-ip', headers->>'x-real-ip', headers->>'x-forwarded-for');
  if raw is null or btrim(raw) = '' then return null; end if;
  return nullif(btrim(split_part(raw, ',', 1)), '');
end $$;

create or replace function private.ip_hash()
returns text language plpgsql stable set search_path = '' as $$
declare
  salt text;
  ip text;
begin
  ip := private.client_ip();
  if ip is null then return null; end if;
  select s.value into salt from private.app_secrets s where s.key = 'ip_hash_salt';
  if salt is null or salt = '' then return null; end if;
  return encode(extensions.digest(convert_to(salt || ':' || ip, 'UTF8'), 'sha256'), 'hex');
end $$;

-- True when this caller is over the limit. A missing salt or IP skips the IP check.
create or replace function private.bump_limit(p_action text, p_device uuid, p_max integer, p_window interval, p_use_ip boolean)
returns boolean language plpgsql volatile set search_path = '' as $$
declare
  hashed text;
  seen integer;
begin
  if p_use_ip then
    hashed := private.ip_hash();
    if hashed is null then return false; end if;
    insert into private.rate_limits (ip_hash, action) values (hashed, p_action);
    select count(*) into seen from private.rate_limits r
    where r.ip_hash = hashed and r.action = p_action and r.created_at > now() - p_window;
  else
    if p_device is null then return false; end if;
    insert into private.rate_limits (device_id, action) values (p_device, p_action);
    select count(*) into seen from private.rate_limits r
    where r.device_id = p_device and r.action = p_action and r.created_at > now() - p_window;
  end if;
  return seen > p_max;
end $$;

create or replace function private.lookup_word(p_kind text, p_word text)
returns text language sql stable set search_path = '' as $$
  select w.word from private.nickname_words w
  where w.kind = p_kind and lower(w.word) = lower(btrim(p_word))
  limit 1
$$;

-- Next free "Word Word" or "Word Word II". taken is true only when somebody else owns the bare pair.
create or replace function private.next_nickname(p_device uuid, p_base text)
returns table (nickname text, taken boolean)
language plpgsql stable set search_path = '' as $$
declare
  candidate text := p_base;
  owner uuid;
  n int := 2;
  roman text;
begin
  select p.id into owner from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(candidate);
  if owner is null or owner = p_device then
    if owner = p_device then
      select p.nickname into nickname from private.players p where p.id = p_device;
    else
      nickname := candidate;
    end if;
    taken := false;
    return next;
    return;
  end if;
  while n <= 40 loop
    roman := private.roman_numeral(n);
    candidate := p_base || ' ' || roman;
    select p.id into owner from private.players p
    where p.nickname is not null and lower(p.nickname) = lower(candidate);
    if owner is null then
      nickname := candidate;
      taken := true;
      return next;
      return;
    elsif owner = p_device then
      select p.nickname into nickname from private.players p where p.id = p_device;
      taken := false;
      return next;
      return;
    end if;
    n := n + 1;
  end loop;
  nickname := null;
  taken := true;
  return next;
end $$;

create or replace function private.ranked_board(p_period text, p_scope text, p_country text)
returns table (
  player_id uuid,
  nickname text,
  country text,
  score integer,
  achieved_at timestamptz,
  rank bigint,
  pos bigint
)
language sql stable set search_path = '' as $$
  with b as (
    select p.id, p.nickname, btrim(p.country::text) as country, pb.score, pb.achieved_at
    from private.period_best pb
    join private.players p on p.id = pb.player_id
    where pb.period = p_period
      and pb.period_start = private.period_start(p_period)
      and p.nickname is not null
      and p.deleted_at is null
      and not p.hidden
      and not p.banned
      and (
        p_scope <> 'country'
        or (p.country is not null and btrim(p.country::text) = btrim(p_country))
      )
  )
  select id, nickname, country, score, achieved_at,
         rank() over (order by score desc),
         row_number() over (order by score desc, achieved_at asc, id)
  from b
$$;

create or replace function private.keep_period_best(p_player uuid, p_period text, p_score integer)
returns void language plpgsql volatile set search_path = '' as $$
declare
  bucket date := private.period_start(p_period);
begin
  insert into private.period_best (player_id, period, period_start, score, achieved_at)
  values (p_player, p_period, bucket, p_score, now())
  on conflict (player_id, period, period_start)
  do update set score = excluded.score, achieved_at = excluded.achieved_at
  where excluded.score > private.period_best.score;
end $$;

create or replace function public.peek_nickname(device_id uuid, adjective text, noun text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  adj text := private.lookup_word('adjective', adjective);
  noun_word text := private.lookup_word('noun', noun);
  base text;
  found record;
begin
  if adj is null or noun_word is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in_list');
  end if;
  if private.bump_limit('peek', device_id, 40, interval '10 minutes', false)
     or private.bump_limit('peek-ip', null, 180, interval '1 hour', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  base := adj || ' ' || noun_word;
  select * into found from private.next_nickname(device_id, base);
  if found.nickname is null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('ok', true, 'nickname', found.nickname, 'taken', found.taken);
end $$;

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
  if is_banned then
    return jsonb_build_object('ok', false, 'reason', 'banned');
  end if;
  existing_base := case
    when existing is null then null
    else regexp_replace(existing, ' [IVXLCDM]+$', '')
  end;
  if existing is not null and lower(existing_base) = lower(base) then
    update private.players
      set country = c, updated_at = now(), deleted_at = null
      where id = device_id;
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
  -- A rename keeps hidden, banned, and pending reports on this player id.
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
  if is_banned then
    return jsonb_build_object('ok', false, 'reason', 'banned');
  end if;
  if private.bump_limit('start_run', device_id, 120, interval '1 hour', false)
     or private.bump_limit('start_run-ip', null, 240, interval '1 hour', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  insert into private.run_tokens (token, player_id) values (token, device_id);
  return jsonb_build_object('ok', true, 'token', token);
end $$;

create or replace function public.submit_score(
  device_id uuid,
  score integer,
  combo integer,
  run_duration_ms integer,
  run_token uuid
)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  tok private.run_tokens%rowtype;
  elapsed_ms numeric;
  effective_ms numeric;
  secs numeric;
  last_at timestamptz;
  today_count integer;
  wk date := private.week_start();
  pb private.player_best%rowtype;
  new_best boolean := false;
  new_week boolean := false;
  is_banned boolean := false;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null) then
    return jsonb_build_object('accepted', false, 'reason', 'unknown_player');
  end if;
  select p.banned into is_banned from private.players p where p.id = device_id;
  if is_banned then
    return jsonb_build_object('accepted', false, 'reason', 'banned');
  end if;
  if score is null or combo is null or run_duration_ms is null or run_token is null
     or score < 0 or combo < 0 or run_duration_ms <= 0 or run_duration_ms > 86400000 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  select * into tok from private.run_tokens t
  where t.token = run_token and t.player_id = device_id
  for update;
  if not found or tok.used_at is not null or tok.created_at < now() - interval '30 minutes' then
    return jsonb_build_object('accepted', false, 'reason', 'invalid_token');
  end if;
  elapsed_ms := extract(epoch from (now() - tok.created_at)) * 1000;
  if run_duration_ms > elapsed_ms + 5000 then
    update private.run_tokens set used_at = now() where token = run_token;
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  effective_ms := least(run_duration_ms::numeric, greatest(elapsed_ms, 1));
  secs := effective_ms / 1000.0;
  if score > 20000 or score > ceil(secs * 40) or combo > ceil(secs * 3) + 1 then
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

  update private.run_tokens set used_at = now() where token = run_token;
  insert into private.scores (player_id, score, combo, run_duration_ms)
  values (device_id, score, combo, run_duration_ms);
  update private.players set last_played_at = now(), updated_at = now() where id = device_id;

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

create or replace function public.get_rank(device_id uuid, period text default 'all')
returns table (
  rank bigint,
  total bigint,
  nickname text,
  score integer,
  country text,
  country_rank bigint,
  country_total bigint,
  country_hidden boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  me private.players%rowtype;
  country_count bigint;
begin
  perform private.check_args('world', period);
  select * into me from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null;
  if not found then return; end if;
  if me.country is not null then
    select count(*) into country_count from private.ranked_board(period, 'country', btrim(me.country::text));
  end if;
  return query
  with w as (select * from private.ranked_board(period, 'world', null)),
       c as (
         select * from private.ranked_board(period, 'country', btrim(me.country::text))
         where me.country is not null and coalesce(country_count, 0) >= 20
       )
  select
    case when me.hidden or me.banned then null else (select w.rank from w where w.player_id = me.id) end,
    (select count(*) from w),
    me.nickname,
    coalesce(
      (select w.score from w where w.player_id = me.id),
      (select pb.score from private.period_best pb
        where pb.player_id = me.id and pb.period = get_rank.period and pb.period_start = private.period_start(get_rank.period))
    ),
    btrim(me.country::text),
    (select c.rank from c where c.player_id = me.id),
    case when me.country is null or coalesce(country_count, 0) < 20 then null else country_count end,
    me.country is not null and coalesce(country_count, 0) < 20;
end $$;

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
  select r.rank, r.nickname, r.country, r.score, r.player_id = me.id
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
             'country', bd.country,
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
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into private.blocks (player_id, blocked_player_id) values (device_id, target)
  on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.unblock_player(device_id uuid, blocked_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
begin
  select p.id into target from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(blocked_nickname);
  if target is null then
    return jsonb_build_object('ok', true);
  end if;
  delete from private.blocks b where b.player_id = device_id and b.blocked_player_id = target;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.list_blocks(device_id uuid)
returns table (nickname text)
language sql stable security definer set search_path = '' as $$
  select p.nickname
  from private.blocks b
  join private.players p on p.id = b.blocked_player_id
  where b.player_id = device_id and p.nickname is not null
  order by p.nickname
$$;

-- Reports only count from accounts at least 24h old with an accepted score, under a daily cap.
-- A report that does not count still blocks for the reporter. The response does not explain why.
create or replace function public.report_player(reporter_device_id uuid, reported_nickname text, reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  reporter private.players%rowtype;
  target uuid;
  tnick text;
  counts boolean := false;
  today_reports integer := 0;
  pending_count integer := 0;
begin
  select * into reporter from private.players p where p.id = reporter_device_id and p.deleted_at is null and p.nickname is not null;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  if reporter.banned then
    return jsonb_build_object('ok', true);
  end if;
  select p.id, p.nickname into target, tnick from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(reported_nickname);
  if target is null or target = reporter_device_id then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  insert into private.blocks (player_id, blocked_player_id) values (reporter_device_id, target)
  on conflict do nothing;
  if not private.bump_limit('report-ip', null, 30, interval '1 day', true) then
    select count(*) into today_reports from private.reports r
    where r.reporter_player_id = reporter_device_id
      and r.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    counts := reporter.created_at <= now() - interval '24 hours'
      and exists (select 1 from private.scores s where s.player_id = reporter_device_id)
      and today_reports < 5;
    if counts then
      insert into private.reports (reporter_player_id, reported_player_id, reported_nickname, reason)
      values (reporter_device_id, target, tnick, left(reason, 200))
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

create or replace function public.delete_player(device_id uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  keep_row boolean := false;
begin
  if device_id is null or not exists (select 1 from private.players p where p.id = device_id) then
    return jsonb_build_object('ok', true, 'reason', 'unknown_player');
  end if;
  delete from private.reports r where r.reporter_player_id = device_id;
  delete from private.blocks b where b.player_id = device_id;
  delete from private.scores s where s.player_id = device_id;
  delete from private.player_best pb where pb.player_id = device_id;
  delete from private.period_best pb where pb.player_id = device_id;
  delete from private.run_tokens t where t.player_id = device_id;
  keep_row := exists (
    select 1 from private.reports r where r.reported_player_id = device_id
  ) or exists (
    select 1 from private.players p
    where p.id = device_id and (p.hidden or p.banned)
  ) or exists (
    select 1 from private.moderation_log m where m.player_id = device_id
  );
  if keep_row then
    update private.players
      set nickname = null, country = null, deleted_at = now(), updated_at = now()
      where id = device_id;
    return jsonb_build_object('ok', true, 'tombstone', true);
  end if;
  delete from private.players p where p.id = device_id;
  return jsonb_build_object('ok', true, 'tombstone', false);
end $$;

-- Moderator tools. Run these as postgres in the SQL editor. Not granted to anon.
create or replace function public.moderator_queue()
returns table (
  report_id bigint,
  player_id uuid,
  nickname text,
  reported_nickname text,
  reason text,
  hidden boolean,
  banned boolean,
  pending_count bigint,
  created_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.reported_player_id, p.nickname, r.reported_nickname, r.reason,
         p.hidden, p.banned,
         (select count(*) from private.reports r2
           where r2.reported_player_id = r.reported_player_id and r2.status = 'pending'),
         r.created_at
  from private.reports r
  join private.players p on p.id = r.reported_player_id
  where r.status = 'pending'
  order by r.created_at
$$;

create or replace function public.resolve_report(report_id bigint, action text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
  pending_left integer;
begin
  if action not in ('dismiss', 'hide', 'ban') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  select r.reported_player_id into target from private.reports r where r.id = report_id;
  if target is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;
  if action = 'dismiss' then
    update private.reports set status = 'dismissed' where id = report_id and status = 'pending';
    select count(*) into pending_left from private.reports r
    where r.reported_player_id = target and r.status = 'pending';
    if pending_left = 0 and not exists (select 1 from private.players p where p.id = target and p.banned) then
      update private.players set hidden = false, updated_at = now() where id = target;
    end if;
  elsif action = 'hide' then
    update private.reports set status = 'upheld' where id = report_id and status = 'pending';
    update private.players set hidden = true, updated_at = now() where id = target;
  else
    update private.reports set status = 'upheld' where id = report_id and status = 'pending';
    update private.players set hidden = true, banned = true, updated_at = now() where id = target;
  end if;
  insert into private.moderation_log (report_id, player_id, action)
  values (report_id, target, action);
  return jsonb_build_object('ok', true, 'action', action, 'player_id', target);
end $$;

revoke all on all functions in schema private from public, anon, authenticated;

do $$
declare
  fn text;
  player_fns text[] := array[
    'public.peek_nickname(uuid, text, text)',
    'public.register_or_update_player(uuid, text, text, text)',
    'public.start_run(uuid)',
    'public.submit_score(uuid, integer, integer, integer, uuid)',
    'public.get_rank(uuid, text)',
    'public.get_around(uuid, text, text, integer)',
    'public.get_board(text, text, text, integer, uuid)',
    'public.block_player(uuid, text)',
    'public.unblock_player(uuid, text)',
    'public.list_blocks(uuid)',
    'public.report_player(uuid, text, text)',
    'public.delete_player(uuid)'
  ];
begin
  foreach fn in array player_fns loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to anon, authenticated', fn);
  end loop;
  execute 'revoke all on function public.moderator_queue() from public, anon, authenticated';
  execute 'revoke all on function public.resolve_report(bigint, text) from public, anon, authenticated';
end $$;
