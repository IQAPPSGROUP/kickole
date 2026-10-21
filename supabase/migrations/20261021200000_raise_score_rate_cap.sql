-- Raise submit_score's points-per-second cap from 25 to 110.
-- Max sustained rate from src/engine/config.ts at the x4 streak multiplier:
--   plain alternating perfect kick: (1+4+2)*4 = 28 pts per ~0.74 s (5.6 m/s at 1.45x gravity + hit pause) ~ 38 pts/s
--   foot/thigh alternation with the 5-pt variety bonus ~ 53 pts/s
--   repeated around-the-world: (1+20+4+2)*4 = 108 pts + 5 combo per ~1.18 s cycle ~ 96 pts/s (upper bound)
-- 96 * 1.15 headroom = 110. The 20000 total cap and token/clock checks are unchanged.
CREATE OR REPLACE FUNCTION public.submit_score(device_id uuid, score integer, combo integer, run_duration_ms integer, run_token uuid, kick_count integer DEFAULT NULL::integer, kick_times text DEFAULT NULL::text, kick_checksum text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if score > 20000 or score > ceil(secs * 110) or combo > ceil(secs * 3) + 1
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
end $function$;
