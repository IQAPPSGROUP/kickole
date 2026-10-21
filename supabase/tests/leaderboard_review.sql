-- Run in the SQL editor after the review migrations. Rolls back. Not part of app CI.
-- psql "$DATABASE_URL" -f supabase/tests/leaderboard_review.sql

begin;

do $$
declare
  a uuid := '00000000-0000-4000-8000-0000000000a1';
  b uuid := '00000000-0000-4000-8000-0000000000b2';
  result jsonb;
  token uuid;
  report_id bigint;
begin
  if has_function_privilege('anon', 'public.moderator_queue()', 'execute') then
    raise exception 'anon can execute moderator_queue';
  end if;
  if has_function_privilege('anon', 'public.resolve_report(bigint, text)', 'execute') then
    raise exception 'anon can execute resolve_report';
  end if;
  if not has_function_privilege('anon', 'public.register_or_update_player(uuid, text, text, text)', 'execute') then
    raise exception 'anon cannot register';
  end if;

  result := public.register_or_update_player(a, 'Turbo', 'Striker', 'GB');
  if result->>'nickname' <> 'Turbo Striker' then
    raise exception 'first tag should have no numeral: %', result;
  end if;

  result := public.register_or_update_player(b, 'Turbo', 'Striker', 'FR');
  if result->>'nickname' <> 'Turbo Striker II' then
    raise exception 'second tag should be II: %', result;
  end if;

  if not has_function_privilege('anon', 'public.suggest_free_names(integer, uuid, text, text)', 'execute') then
    raise exception 'anon cannot suggest free names';
  end if;
  result := public.suggest_free_names(8, a);
  if result->>'ok' <> 'true' or jsonb_array_length(result->'names') < 1 then
    raise exception 'suggest_free_names failed: %', result;
  end if;
  result := public.suggest_free_names(4, b, 'Turbo', 'Striker');
  if result->>'ok' <> 'true' or jsonb_array_length(result->'names') <> 0 then
    raise exception 'a taken bare pair must not be suggested: %', result;
  end if;
  result := public.suggest_free_names(4, a, 'Turbo', 'Striker');
  if result->>'ok' <> 'true'
     or jsonb_array_length(result->'names') <> 1
     or result->'names'->0->>'adjective' <> 'Turbo'
     or result->'names'->0->>'noun' <> 'Striker' then
    raise exception 'own bare name stays available: %', result;
  end if;
  result := public.suggest_free_names(4, a, 'Neon', null);
  if result->>'ok' <> 'true' or jsonb_array_length(result->'names') < 1 then
    raise exception 'locked first word returned nothing: %', result;
  end if;
  if exists (
    select 1 from jsonb_array_elements(result->'names') elem
    where elem->>'adjective' <> 'Neon'
  ) then
    raise exception 'a locked first word must stay: %', result;
  end if;
  result := public.suggest_free_names(1, a, 'NotAWord', null);
  if result->>'ok' <> 'false' or result->>'reason' <> 'not_in_list' then
    raise exception 'unknown word should be rejected: %', result;
  end if;

  result := public.peek_nickname(a, 'Neon', 'Falcon');
  if result->>'ok' <> 'true' or result->>'nickname' <> 'Neon Falcon' then
    raise exception 'peek failed: %', result;
  end if;

  update private.players set hidden = true where id = b;
  result := public.register_or_update_player(b, 'Neon', 'Falcon', 'FR');
  if result->>'ok' <> 'true' or result->>'nickname' <> 'Neon Falcon' then
    raise exception 'rename should keep the new words: %', result;
  end if;
  if not exists (select 1 from private.players p where p.id = b and p.hidden) then
    raise exception 'hide must survive a rename';
  end if;

  result := public.register_or_update_player(b, 'Golden', 'Wolf', 'FR');
  if result->>'reason' <> 'rename_limit' then
    raise exception 'second rename inside 7 days should fail: %', result;
  end if;

  result := public.register_or_update_player(a, 'Turbo', 'Striker', 'ZZ');
  if result->>'reason' <> 'invalid_country' then
    raise exception 'ZZ is not an ISO country we list: %', result;
  end if;

  result := public.get_board('all', 'country', 'GB', 10, a);
  if result->>'hidden' <> 'true' then
    raise exception 'a country with one player must be hidden: %', result;
  end if;

  update private.players set created_at = now() - interval '2 days' where id = b;
  insert into private.scores (player_id, score, combo, run_duration_ms) values (b, 10, 1, 1000);
  update private.scores set created_at = now() - interval '1 hour' where player_id = b;
  result := public.report_player(b, 'Turbo Striker', null);
  if result->>'ok' <> 'true' then
    raise exception 'eligible report should succeed: %', result;
  end if;
  if not exists (
    select 1 from private.reports r where r.reporter_player_id = b and r.reported_player_id = a and r.status = 'pending'
  ) then
    raise exception 'eligible report was not stored';
  end if;

  result := public.report_player(a, 'Neon Falcon', null);
  if exists (
    select 1 from private.reports r where r.reporter_player_id = a and r.status = 'pending'
  ) then
    raise exception 'a brand-new reporter must not create a counting report';
  end if;

  result := public.delete_player(a);
  if result->>'tombstone' <> 'true' then
    raise exception 'open report should keep a tombstone: %', result;
  end if;
  if exists (select 1 from private.players p where p.id = a and p.nickname is not null) then
    raise exception 'tombstone should clear the nickname';
  end if;
  if not exists (select 1 from private.reports r where r.reported_player_id = a and r.status = 'pending') then
    raise exception 'report against the deleted player must stay';
  end if;

  result := public.start_run(b);
  token := (result->>'token')::uuid;
  if token is null then
    raise exception 'start_run failed: %', result;
  end if;
  result := public.submit_score(b, 1, 0, 1000, token);
  if result->>'accepted' <> 'true' then
    raise exception 'token submit should be accepted: %', result;
  end if;
  result := public.submit_score(b, 12, 1, 1000, token);
  if result->>'reason' <> 'invalid_token' then
    raise exception 'a token is single-use: %', result;
  end if;

  result := public.start_run(b);
  token := (result->>'token')::uuid;
  result := public.submit_score(b, 20, 1, 600000, token);
  if result->>'reason' <> 'implausible' then
    raise exception 'duration past the token age should fail: %', result;
  end if;

  select r.id into report_id from private.reports r where r.reported_player_id = a and r.status = 'pending' limit 1;
  result := public.resolve_report(report_id, 'dismiss');
  if result->>'ok' <> 'true' then
    raise exception 'dismiss failed: %', result;
  end if;
  if not exists (select 1 from private.moderation_log m where m.report_id = report_id and m.action = 'dismiss') then
    raise exception 'moderation log missing';
  end if;
end $$;

rollback;
