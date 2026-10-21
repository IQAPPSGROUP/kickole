-- Nickname validation: returns null if OK, else a reason code.
create or replace function private.nickname_problem(p_nickname text)
returns text language plpgsql stable set search_path = '' as $$
declare norm text; squashed text; tokens text[];
begin
  if p_nickname is null or char_length(p_nickname) not between 3 and 16 then return 'length'; end if;
  if p_nickname !~ '^[A-Za-z0-9_]+$' then return 'charset'; end if;
  if p_nickname ~ '[0-9]{6,}' then return 'looks_like_phone'; end if;
  norm := translate(lower(p_nickname), '013457@$', 'oieastas');
  squashed := replace(norm, '_', '');
  tokens := regexp_split_to_array(norm, '_+');
  if exists (select 1 from private.blocked_words w
             where (w.match_mode = 'contains' and (position(w.word in squashed) > 0 or position(w.word in lower(p_nickname)) > 0))
                or (w.match_mode = 'exact' and (w.word = squashed or w.word = any(tokens)
                     or squashed ~ ('^' || w.word || '[0-9]*$') ))) then
    return 'blocked_word';
  end if;
  return null;
end $$;

create or replace function private.week_start(ts timestamptz default now())
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', ts at time zone 'UTC')::date  -- ISO week, Monday UTC
$$;

-- Visible board for a scope/period, ranked. p_country only used for scope='country'.
create or replace function private.board(p_scope text, p_country text, p_period text)
returns table (player_id uuid, nickname text, country text, score integer, achieved_at timestamptz, rank bigint, pos bigint)
language sql stable set search_path = '' as $$
  with b as (
    select p.id, p.nickname, p.country::text as country,
           case when p_period = 'week' then pb.week_score else pb.best_score end as score,
           case when p_period = 'week' then pb.week_at else pb.best_at end as achieved_at
    from private.player_best pb join private.players p on p.id = pb.player_id
    where not p.hidden
      and (p_period <> 'week' or pb.week_start = private.week_start())
      and (p_scope <> 'country' or (p.country is not null and p.country = p_country))
  )
  select id, nickname, country, score, achieved_at,
         rank() over (order by score desc),
         row_number() over (order by score desc, achieved_at asc, id)
  from b
$$;

create or replace function private.check_args(p_scope text, p_period text)
returns void language plpgsql immutable set search_path = '' as $$
begin
  if p_scope not in ('world','country') then raise exception 'invalid_scope' using errcode = '22023'; end if;
  if p_period not in ('all','week') then raise exception 'invalid_period' using errcode = '22023'; end if;
end $$;

-- ===== Public RPCs (security definer, callable by anon) =====

create or replace function public.check_nickname(nickname text, device_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare prob text := private.nickname_problem(nickname);
begin
  if prob is null and exists (select 1 from private.players p where lower(p.nickname) = lower(check_nickname.nickname)
                              and (device_id is null or p.id <> device_id)) then
    prob := 'taken';
  end if;
  return jsonb_build_object('ok', prob is null, 'reason', prob);
end $$;

create or replace function public.register_or_update_player(device_id uuid, nickname text, country text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare prob text; c text := nullif(upper(trim(country)), ''); old_nick text;
begin
  if device_id is null then raise exception 'device_id_required' using errcode = '22023'; end if;
  prob := private.nickname_problem(nickname);
  if prob is not null then return jsonb_build_object('ok', false, 'reason', prob); end if;
  if c is not null and c !~ '^[A-Z]{2}$' then return jsonb_build_object('ok', false, 'reason', 'invalid_country'); end if;
  if exists (select 1 from private.players p where lower(p.nickname) = lower(register_or_update_player.nickname) and p.id <> device_id) then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  select p.nickname into old_nick from private.players p where p.id = device_id;
  begin
    insert into private.players (id, nickname, country) values (device_id, nickname, c)
    on conflict (id) do update set nickname = excluded.nickname, country = excluded.country, updated_at = now();
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end;
  -- A rename clears reports against the old nickname and un-hides the player.
  if old_nick is not null and lower(old_nick) <> lower(nickname) then
    update private.reports set status = 'superseded' where reported_player_id = device_id and status = 'pending';
    update private.players set hidden = false where id = device_id;
  end if;
  return jsonb_build_object('ok', true, 'nickname', nickname, 'country', c);
end $$;

create or replace function public.submit_score(device_id uuid, score integer, combo integer, run_duration_ms integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  wk date := private.week_start();
  secs numeric;
  last_at timestamptz;
  today_count int;
  pb private.player_best%rowtype;
  new_best boolean := false; new_week boolean := false;
begin
  if not exists (select 1 from private.players p where p.id = device_id) then
    return jsonb_build_object('accepted', false, 'reason', 'unknown_player');
  end if;
  if score is null or combo is null or run_duration_ms is null or score < 0 or combo < 0 or run_duration_ms <= 0
     or run_duration_ms > 86400000 then
    return jsonb_build_object('accepted', false, 'reason', 'invalid');
  end if;
  secs := run_duration_ms / 1000.0;
  -- Plausibility: <= ~3 kicks/sec, <= 40 points/sec, hard cap 20000.
  if score > 20000 or score > ceil(secs * 40) or combo > ceil(secs * 3) + 1 then
    return jsonb_build_object('accepted', false, 'reason', 'implausible');
  end if;
  perform pg_advisory_xact_lock(hashtextextended(device_id::text, 0));
  select max(s.created_at), count(*) filter (where s.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC')
    into last_at, today_count from private.scores s where s.player_id = device_id and s.created_at > now() - interval '1 day';
  if last_at is not null and last_at > now() - interval '10 seconds' then
    return jsonb_build_object('accepted', false, 'reason', 'rate_limited');
  end if;
  if today_count >= 200 then
    return jsonb_build_object('accepted', false, 'reason', 'daily_limit');
  end if;

  insert into private.scores (player_id, score, combo, run_duration_ms) values (device_id, score, combo, run_duration_ms);

  select * into pb from private.player_best where player_id = device_id for update;
  if not found then
    insert into private.player_best values (device_id, score, now(), wk, score, now());
    new_best := true; new_week := true;
  else
    if score > pb.best_score then pb.best_score := score; pb.best_at := now(); new_best := true; end if;
    if pb.week_start <> wk then pb.week_start := wk; pb.week_score := score; pb.week_at := now(); new_week := true;
    elsif score > pb.week_score then pb.week_score := score; pb.week_at := now(); new_week := true; end if;
    update private.player_best set best_score = pb.best_score, best_at = pb.best_at, week_start = pb.week_start,
      week_score = pb.week_score, week_at = pb.week_at where player_id = device_id;
  end if;
  select * into pb from private.player_best where player_id = device_id;
  return jsonb_build_object('accepted', true, 'best', pb.best_score, 'week_best', pb.week_score,
                            'new_best', new_best, 'new_week_best', new_week);
end $$;

create or replace function public.get_rank(device_id uuid, scope text default 'world', period text default 'all')
returns table (rank bigint, total bigint, nickname text, score integer, country text, country_rank bigint, country_total bigint)
language plpgsql stable security definer set search_path = '' as $$
declare me private.players%rowtype;
begin
  perform private.check_args(scope, period);
  select * into me from private.players p where p.id = device_id;
  if not found then return; end if;
  return query
  with w as (select * from private.board(scope, me.country, period)),
       c as (select * from private.board('country', me.country, period) where me.country is not null)
  select (select w.rank from w where w.player_id = me.id),
         (select count(*) from w),
         me.nickname,
         coalesce((select w.score from w where w.player_id = me.id),
                  (select case when period = 'week' then case when pb.week_start = private.week_start() then pb.week_score end else pb.best_score end
                     from private.player_best pb where pb.player_id = me.id)),
         me.country::text,
         (select c.rank from c where c.player_id = me.id),
         case when me.country is null then null else (select count(*) from c) end;
end $$;

create or replace function public.get_around(device_id uuid, scope text default 'world', period text default 'all', n integer default 3)
returns table (rank bigint, nickname text, country text, score integer, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare me private.players%rowtype; my_pos bigint; nn int := least(greatest(coalesce(n, 3), 0), 10);
begin
  perform private.check_args(scope, period);
  select * into me from private.players p where p.id = device_id;
  if not found then return; end if;
  if scope = 'country' and me.country is null then return; end if;
  return query
  with b as (
    select bd.* from private.board(scope, me.country, period) bd
    where bd.player_id = me.id
       or not exists (select 1 from private.blocks bl where bl.player_id = me.id and bl.blocked_player_id = bd.player_id)
  ), r as (select b.*, row_number() over (order by b.pos) as vpos from b),
  m as (select r.vpos from r where r.player_id = me.id)
  select r.rank, r.nickname, r.country, r.score, r.player_id = me.id
  from r, m where r.vpos between m.vpos - nn and m.vpos + nn
  order by r.vpos;
end $$;

create or replace function public.get_top(scope text default 'world', country_code text default null, period text default 'all',
                                          lim integer default 10, device_id uuid default null)
returns table (rank bigint, nickname text, country text, score integer, mine boolean)
language plpgsql stable security definer set search_path = '' as $$
declare c text := nullif(upper(trim(country_code)), '');
begin
  perform private.check_args(scope, period);
  if scope = 'country' and c is null and device_id is not null then
    select p.country into c from private.players p where p.id = device_id;
  end if;
  if scope = 'country' and c is null then return; end if;
  return query
  select bd.rank, bd.nickname, bd.country, bd.score, coalesce(bd.player_id = device_id, false)
  from private.board(scope, c, period) bd
  where device_id is null
     or not exists (select 1 from private.blocks bl where bl.player_id = device_id and bl.blocked_player_id = bd.player_id)
  order by bd.pos
  limit least(greatest(coalesce(lim, 10), 1), 50);
end $$;

create or replace function public.block_player(device_id uuid, blocked_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare target uuid;
begin
  if not exists (select 1 from private.players p where p.id = device_id) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player'); end if;
  select p.id into target from private.players p where lower(p.nickname) = lower(blocked_nickname);
  if target is null or target = device_id then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  insert into private.blocks (player_id, blocked_player_id) values (device_id, target) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;

-- Report also blocks the name for the reporter. 3 distinct pending reporters auto-hide the player pending review.
create or replace function public.report_player(reporter_device_id uuid, reported_nickname text, reason text default null)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare target uuid; tnick text; n int;
begin
  if not exists (select 1 from private.players p where p.id = reporter_device_id) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player'); end if;
  select p.id, p.nickname into target, tnick from private.players p where lower(p.nickname) = lower(reported_nickname);
  if target is null or target = reporter_device_id then return jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  insert into private.reports (reporter_player_id, reported_player_id, reported_nickname, reason)
    values (reporter_device_id, target, tnick, left(reason, 200))
    on conflict (reporter_player_id, reported_player_id) where status = 'pending' do nothing;
  insert into private.blocks (player_id, blocked_player_id) values (reporter_device_id, target) on conflict do nothing;
  select count(distinct r.reporter_player_id) into n from private.reports r where r.reported_player_id = target and r.status = 'pending';
  if n >= 3 then update private.players set hidden = true, updated_at = now() where id = target and not hidden; end if;
  return jsonb_build_object('ok', true);
end $$;

-- Lock down: private helpers not callable by API roles; public RPCs callable by anon/authenticated only.
revoke all on all functions in schema private from public, anon, authenticated;
do $$ declare f text; begin
  for f in select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in
           ('check_nickname','register_or_update_player','submit_score','get_rank','get_around','get_top','block_player','report_player')
  loop
    execute format('revoke all on function %s from public', f);
    execute format('grant execute on function %s to anon, authenticated', f);
  end loop;
end $$;
