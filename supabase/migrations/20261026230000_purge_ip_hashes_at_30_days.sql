-- Commit only. Not applied to the live Supabase project.
-- Null ip_hash after 30 days on private.scores, private.reports, and private.players.
-- That includes banned players. There is no exception.
-- A ban that matched only by IP hash lapses once that hash is cleared.
-- A ban stored on players.banned, and any nickname restriction, stay as they are.
-- The existing daily cron job purge_leaderboard stays at 15 3 * * * and still
-- calls select private.purge_leaderboard(). This file does not unschedule or
-- reschedule it, and it does not call purge_leaderboard().
-- Players that already have an ip_hash and no ip_hash_set_at are backfilled from
-- coalesce(last_played_at, updated_at, created_at). The first daily purge then
-- clears hashes whose activity timestamp is already older than 30 days.
-- Hashes younger than 30 days stay until a later run.

alter table private.players add column if not exists ip_hash_set_at timestamptz;

update private.players
  set ip_hash_set_at = coalesce(last_played_at, updated_at, created_at)
where ip_hash is not null
  and ip_hash_set_at is null;

create or replace function private.purge_leaderboard()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.scores s where s.created_at < now() - interval '12 months';

  delete from private.reports r
  where r.created_at < now() - interval '90 days'
    and r.status in ('upheld', 'dismissed', 'superseded');
  delete from private.moderation_log m where m.created_at < now() - interval '90 days';
  delete from private.rate_limits l where l.created_at < now() - interval '30 days';
  delete from private.run_tokens t where t.created_at < now() - interval '7 days';

  update private.scores s
    set ip_hash = null
  where s.ip_hash is not null
    and s.created_at < now() - interval '30 days';

  update private.reports r
    set ip_hash = null
  where r.ip_hash is not null
    and r.created_at < now() - interval '30 days';

  update private.players p
    set ip_hash = null,
        ip_hash_set_at = null
  where p.ip_hash is not null
    and coalesce(p.ip_hash_set_at, p.last_played_at, p.updated_at, p.created_at) < now() - interval '30 days';

  update private.players p
    set nickname = null,
        country = null,
        deleted_at = coalesce(p.deleted_at, now()),
        updated_at = now()
  where p.nickname is not null
    and coalesce(p.last_played_at, p.updated_at, p.created_at) < now() - interval '2 years'
    and exists (select 1 from private.reports r where r.reported_player_id = p.id);

  delete from private.player_best pb
  using private.players p
  where pb.player_id = p.id and p.deleted_at is not null;

  delete from private.period_best pb
  using private.players p
  where pb.player_id = p.id and p.deleted_at is not null;

  delete from private.players p
  where coalesce(p.last_played_at, p.deleted_at, p.updated_at, p.created_at) < now() - interval '2 years'
    and not exists (select 1 from private.reports r where r.reported_player_id = p.id)
    and not exists (
      select 1 from private.moderation_log m
      where m.player_id = p.id and m.created_at > now() - interval '90 days'
    );

  delete from private.players p
  where p.deleted_at is not null
    and not exists (select 1 from private.reports r where r.reported_player_id = p.id)
    and not exists (
      select 1 from private.moderation_log m
      where m.player_id = p.id and m.created_at > now() - interval '90 days'
    );
end $$;

revoke all on function private.purge_leaderboard() from public, anon, authenticated;

create or replace function private.remember_ip(p_device uuid)
returns void language plpgsql volatile set search_path = '' as $$
begin
  if p_device is null or private.client_ip() is null then return; end if;
  update private.players
    set ip_hash = private.ip_hash(),
        ip_hash_set_at = now()
  where id = p_device;
end $$;

revoke all on function private.remember_ip(uuid) from public, anon, authenticated;

-- Verification for Lee after the next daily purge. Do not run purge_leaderboard() from this file.
-- select count(*) from private.scores
--  where ip_hash is not null and created_at < now() - interval '30 days';
-- select count(*) from private.reports
--  where ip_hash is not null and created_at < now() - interval '30 days';
-- select count(*) from private.players
--  where ip_hash is not null
--    and coalesce(ip_hash_set_at, last_played_at, updated_at, created_at) < now() - interval '30 days';
-- Those three counts should be 0.
-- select jobname, schedule, command from cron.job where jobname = 'purge_leaderboard';
-- Expect schedule 15 3 * * * and command select private.purge_leaderboard().
-- select id, banned, ip_hash is not null as still_hashed
--  from private.players where banned;
-- Banned rows stay banned. An IP-hash match can lapse; the player id ban does not.
