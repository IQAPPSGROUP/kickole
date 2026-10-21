-- Commit only. Apply on the kickole project by hand.
-- Drops Sonic, Prime, Cougar and Beaver, and blocks five trademark pairs.

delete from private.nickname_words
where (kind = 'adjective' and lower(word) in ('sonic', 'prime'))
   or (kind = 'noun' and lower(word) in ('cougar', 'beaver'));

insert into private.nickname_words (kind, word) values
  ('adjective', 'Peppy'),
  ('adjective', 'Jaunty'),
  ('noun', 'Puffin'),
  ('noun', 'Meerkat')
on conflict do nothing;

create table if not exists private.blocked_pairs (
  adjective text not null,
  noun text not null,
  primary key (adjective, noun)
);

alter table private.blocked_pairs enable row level security;

insert into private.blocked_pairs (adjective, noun) values
  ('ghost', 'rider'),
  ('power', 'ranger'),
  ('ninja', 'turtle'),
  ('desert', 'eagle'),
  ('silver', 'fox')
on conflict do nothing;

create or replace function private.is_blocked_pair(p_adj text, p_noun text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from private.blocked_pairs b
    where b.adjective = lower(btrim(p_adj))
      and b.noun = lower(btrim(p_noun))
  )
$$;

revoke all on function private.is_blocked_pair(text, text) from public, anon, authenticated;

create or replace function public.peek_nickname(device_id uuid, adjective text, noun text)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare
  adj text;
  noun_word text;
  base text;
  found record;
begin
  if device_id is null then
    return jsonb_build_object('ok', false, 'reason', 'device_required');
  end if;
  adj := private.lookup_word('adjective', adjective);
  noun_word := private.lookup_word('noun', noun);
  if adj is null or noun_word is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in_list');
  end if;
  if private.is_blocked_pair(adj, noun_word)
     and not exists (
       select 1 from private.players p
       where p.id = device_id
         and p.nickname is not null
         and lower(regexp_replace(p.nickname, ' [IVXLCDM]+$', '')) = lower(adj || ' ' || noun_word)
     ) then
    return jsonb_build_object('ok', false, 'reason', 'blocked_pair');
  end if;
  if private.bump_limit('peek', device_id, 40, interval '10 minutes', false)
     or private.bump_limit('peek-ip', null, 180, interval '1 hour', true) then
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  base := adj || ' ' || noun_word;
  select * into found from private.next_nickname(device_id, base);
  if found.nickname is null then
    return jsonb_build_object('ok', false, 'reason', 'taken');
  end if;
  return jsonb_build_object('ok', true, 'nickname', found.nickname, 'taken', found.taken);
end $$;

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
  if device_id is null then
    return jsonb_build_object('ok', false, 'reason', 'device_required', 'names', '[]'::jsonb);
  end if;
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
  if private.bump_limit('suggest', device_id, 80, interval '10 minutes', false)
     or private.bump_limit('suggest-ip', null, 120, interval '10 minutes', true) then
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
    if private.is_blocked_pair(adj, noun_word) then
      continue;
    end if;
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
