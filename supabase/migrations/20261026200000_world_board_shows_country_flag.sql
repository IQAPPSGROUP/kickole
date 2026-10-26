-- World board rows include the country the player chose, so the client can
-- show that flag beside the nickname. International stays null, so no flag.
-- Country boards still hide entirely under 20 players.
-- Apply after 20261021150300_world_board_hides_country.sql.
-- create or replace keeps the existing grants.

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
         r.country,
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
