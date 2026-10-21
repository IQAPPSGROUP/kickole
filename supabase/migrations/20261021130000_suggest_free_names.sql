-- Commit only. Apply on the kickole project by hand with the other review migrations.
-- Cheap suggestions for Shuffle and Pick one for me.
-- Samples word-list pairs and skips a bare name somebody else already has.
-- Returns at most 8. The client prefers these so a numeral is rare.

create or replace function public.suggest_free_names(
  n integer,
  device_id uuid default null,
  adjective text default null,
  noun text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  want integer := least(greatest(coalesce(n, 1), 1), 8);
  adj_locked text;
  noun_locked text;
  adj text;
  noun_word text;
  names jsonb := '[]'::jsonb;
  seen text[] := '{}';
  key text;
  tries integer := 0;
  max_tries integer;
begin
  if adjective is not null and btrim(adjective) <> '' then
    adj_locked := private.lookup_word('adjective', adjective);
    if adj_locked is null then
      return jsonb_build_object('ok', false, 'reason', 'not_in_list', 'names', '[]'::jsonb);
    end if;
  end if;
  if noun is not null and btrim(noun) <> '' then
    noun_locked := private.lookup_word('noun', noun);
    if noun_locked is null then
      return jsonb_build_object('ok', false, 'reason', 'not_in_list', 'names', '[]'::jsonb);
    end if;
  end if;
  if private.bump_limit('suggest', device_id, 80, interval '10 minutes', false) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited', 'names', '[]'::jsonb);
  end if;
  max_tries := want * 12;
  while jsonb_array_length(names) < want and tries < max_tries loop
    tries := tries + 1;
    if adj_locked is null then
      select w.word into adj from private.nickname_words w
      where w.kind = 'adjective'
      order by random()
      limit 1;
    else
      adj := adj_locked;
    end if;
    if noun_locked is null then
      select w.word into noun_word from private.nickname_words w
      where w.kind = 'noun'
      order by random()
      limit 1;
    else
      noun_word := noun_locked;
    end if;
    if adj is null or noun_word is null then
      exit;
    end if;
    key := lower(adj) || ' ' || lower(noun_word);
    if key = any (seen) then
      continue;
    end if;
    seen := seen || key;
    if exists (
      select 1 from private.players p
      where p.nickname is not null
        and lower(p.nickname) = key
        and p.id is distinct from device_id
    ) then
      continue;
    end if;
    names := names || jsonb_build_array(jsonb_build_object('adjective', adj, 'noun', noun_word));
  end loop;
  return jsonb_build_object('ok', true, 'names', names);
end $$;

revoke all on function public.suggest_free_names(integer, uuid, text, text) from public;
grant execute on function public.suggest_free_names(integer, uuid, text, text) to anon, authenticated;
