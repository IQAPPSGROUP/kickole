-- World board rows include the country the player chose, so the app can show
-- a flag beside the nickname. International stays null and shows no flag.
-- World and country boards both hide entirely under 20 scored players in
-- that time frame. The hidden payload has no nicknames and no player count.
-- Apply after 20261021150300_world_board_hides_country.sql.
-- This file is not applied by the app build. Run it in the Supabase project
-- before a public release that should show live flags or hide a small world board.

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
  board_count bigint;
  board_country text;
begin
  perform private.check_args(scope, period);
  select * into me from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null;
  if not found or me.hidden or me.banned then return; end if;
  board_country := btrim(me.country::text);
  if scope = 'country' then
    if me.country is null then return; end if;
    select count(*) into board_count from private.ranked_board(period, 'country', board_country);
    if coalesce(board_count, 0) < 20 then return; end if;
  elsif scope = 'world' then
    select count(*) into board_count from private.ranked_board(period, 'world', null);
    if coalesce(board_count, 0) < 20 then return; end if;
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
  board_count bigint;
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
    select count(*) into board_count from private.ranked_board(period, 'country', c);
    if coalesce(board_count, 0) < 20 then
      return jsonb_build_object('hidden', true, 'rows', '[]'::jsonb);
    end if;
  elsif scope = 'world' then
    select count(*) into board_count from private.ranked_board(period, 'world', null);
    if coalesce(board_count, 0) < 20 then
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

-- get_rank still fed the in-game rank panel. Under 20 it now returns no
-- place and no total, so the count of players is not in the payload.
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
  world_count bigint;
begin
  perform private.check_args('world', period);
  select * into me from private.players p where p.id = device_id and p.deleted_at is null and p.nickname is not null;
  if not found then return; end if;
  select count(*) into world_count from private.ranked_board(period, 'world', null);
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
    case when me.hidden or me.banned or coalesce(world_count, 0) < 20 then null else (select w.rank from w where w.player_id = me.id) end,
    case when coalesce(world_count, 0) < 20 then null else (select count(*) from w) end,
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
