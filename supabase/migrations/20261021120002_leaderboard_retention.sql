-- KICKOLÉ leaderboard retention. Commit only — apply after the review RPCs.
-- The purge function exists even when pg_cron cannot be scheduled.

create or replace function private.purge_leaderboard()
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from private.scores s where s.created_at < now() - interval '12 months';

  delete from private.reports r where r.created_at < now() - interval '90 days';
  delete from private.moderation_log m where m.created_at < now() - interval '90 days';
  delete from private.rate_limits l where l.created_at < now() - interval '30 days';
  delete from private.run_tokens t where t.created_at < now() - interval '7 days';

  -- Inactive players who still have a report become tombstones until that report ages out.
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

  -- Tombstones can go as soon as the reports about them have aged out.
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
    raise notice 'pg_cron extension unavailable: %', sqlerrm;
    return;
  end;
  begin
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'purge_leaderboard';
  exception when others then
    raise notice 'pg_cron unschedule skipped: %', sqlerrm;
  end;
  begin
    perform cron.schedule('purge_leaderboard', '15 3 * * *', 'select private.purge_leaderboard()');
  exception when others then
    raise notice 'pg_cron not scheduled: %', sqlerrm;
  end;
end $$;
