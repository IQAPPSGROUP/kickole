-- Commit only. Apply on the kickole project by hand.
-- Open reports stay. Settled reports older than 90 days go.
-- Scheduling fails the migration when pg_cron is not available.

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

do $$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    raise exception 'pg_cron is unavailable: %', sqlerrm;
  end;
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'pg_cron is unavailable';
  end if;
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge_leaderboard';
  perform cron.schedule('purge_leaderboard', '15 3 * * *', 'select private.purge_leaderboard()');
end $$;
