-- Commit only. Apply on the kickole project by hand after 20261021150600.
-- unblock_player used to delete a block for any device id, with no limit.
-- A missing or deleted device now returns unknown_player, matching block_player.
-- block_player previously had no rate limit. The two RPCs use separate
-- counters, with the same limits, so unblock is not a weaker write:
--   40 calls per device per 10 minutes
--   80 calls per hashed IP per 10 minutes
-- Header-less callers share the 'unknown' bucket. A missing hash fails closed.
-- Over its own budget the RPC returns rate_limited and does not change blocks.

create or replace function public.block_player(device_id uuid, blocked_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  if private.bump_limit('block', device_id, 40, interval '10 minutes', false)
     or private.bump_limit('block-ip', null, 80, interval '10 minutes', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
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

create or replace function public.unblock_player(device_id uuid, blocked_nickname text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  target uuid;
begin
  if not exists (select 1 from private.players p where p.id = device_id and p.deleted_at is null) then
    return jsonb_build_object('ok', false, 'reason', 'unknown_player');
  end if;
  if private.bump_limit('unblock', device_id, 40, interval '10 minutes', false)
     or private.bump_limit('unblock-ip', null, 80, interval '10 minutes', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  select p.id into target from private.players p
  where p.nickname is not null and lower(p.nickname) = lower(blocked_nickname);
  if target is null or target = device_id then
    return jsonb_build_object('ok', true);
  end if;
  delete from private.blocks b where b.player_id = device_id and b.blocked_player_id = target;
  return jsonb_build_object('ok', true);
end $$;
