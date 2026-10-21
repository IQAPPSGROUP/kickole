-- Commit only. Apply on the kickole project by hand after 20261021150700.
-- A report stores one of three codes, matching the picker:
--   rude            Rude or mean name
--   impersonation   Pretending to be someone
--   other           Something else
-- A missing or unknown code returns invalid_reason before the nickname
-- lookup, so that answer does not reveal whether the name exists.
-- A known device reporting a missing name still returns a generic {ok:true}.
-- Historical free-text reasons are folded to 'other' so the check can land.

do $$
declare
  cons name;
begin
  for cons in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'private'
      and rel.relname = 'reports'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) like '%reason%'
  loop
    execute format('alter table private.reports drop constraint %I', cons);
  end loop;
end $$;

update private.reports
set reason = 'other'
where reason is not null
  and reason not in ('rude', 'impersonation', 'other');

alter table private.reports
  add constraint reports_reason_code
  check (reason is null or reason in ('rude', 'impersonation', 'other'));

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
  if reason is null or reason not in ('rude', 'impersonation', 'other') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_reason');
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
      values (reporter_device_id, target, tnick, reason, stored_ip)
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
