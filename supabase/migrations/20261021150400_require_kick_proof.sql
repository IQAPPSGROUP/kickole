-- submit_score rejects a run that omits the kick proof. No released build
-- calls this RPC yet, so a missing count, timestamp list, or checksum is
-- implausible. Apply after 20261021150100_score_ip_and_board_guards.sql.

create or replace function private.kick_proof_ok(
  p_device uuid,
  p_token uuid,
  p_score integer,
  p_duration integer,
  p_elapsed_ms numeric,
  p_kick_count integer,
  p_kick_times text,
  p_kick_checksum text
)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  part text;
  prev integer := -1;
  stamp integer;
  seen integer := 0;
  secs numeric := greatest(p_elapsed_ms, 1) / 1000.0;
begin
  if p_kick_count is null or p_kick_times is null or p_kick_checksum is null then
    return false;
  end if;
  if p_kick_count < 0 or p_kick_count > ceil(secs * 5) + 1 then return false; end if;
  if p_score > 0 and p_kick_count < 1 then return false; end if;
  if char_length(p_kick_times) > 8000 then return false; end if;
  if p_kick_count = 0 then
    if btrim(p_kick_times) <> '' then return false; end if;
  else
    foreach part in array string_to_array(p_kick_times, ',') loop
      if part !~ '^[0-9]{1,8}$' then return false; end if;
      stamp := part::integer;
      if stamp < prev or stamp > ceil(p_elapsed_ms) + 5000 then return false; end if;
      prev := stamp;
      seen := seen + 1;
    end loop;
    if seen <> p_kick_count then return false; end if;
  end if;
  return p_kick_checksum = private.run_checksum(p_device, p_token, p_score, p_kick_count, p_duration, p_kick_times);
end $$;

revoke all on function private.kick_proof_ok(uuid, uuid, integer, integer, numeric, integer, text, text) from public, anon, authenticated;
