-- Temporary. Returns which proxy headers arrived on a Data API request.
-- Values are never selected. Apply, call once, then apply the drop migration.

create or replace function public.debug_ip_headers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  headers json;
  unreadable boolean := false;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    unreadable := true;
    headers := null;
  end;
  return jsonb_build_object(
    'headers_readable', headers is not null and not unreadable,
    'cf_connecting_ip', coalesce(btrim(headers->>'cf-connecting-ip'), '') <> '',
    'x_real_ip', coalesce(btrim(headers->>'x-real-ip'), '') <> '',
    'x_forwarded_for', coalesce(btrim(headers->>'x-forwarded-for'), '') <> '',
    'sb_forwarded_for', coalesce(btrim(headers->>'sb-forwarded-for'), '') <> '',
    'forwarded', coalesce(btrim(headers->>'forwarded'), '') <> '',
    'true_client_ip', coalesce(btrim(headers->>'true-client-ip'), '') <> '',
    'cf_ipcountry', coalesce(btrim(headers->>'cf-ipcountry'), '') <> '',
    'x_forwarded_for_has_comma', position(',' in coalesce(headers->>'x-forwarded-for', '')) > 0,
    'sb_forwarded_for_has_comma', position(',' in coalesce(headers->>'sb-forwarded-for', '')) > 0,
    'cf_connecting_ip_matches_probe', btrim(coalesce(headers->>'cf-connecting-ip', '')) = '203.0.113.10',
    'x_real_ip_matches_probe', btrim(coalesce(headers->>'x-real-ip', '')) = '203.0.113.11',
    'x_forwarded_for_first_matches_probe', btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1)) = '203.0.113.12',
    'sb_forwarded_for_first_matches_probe', btrim(split_part(coalesce(headers->>'sb-forwarded-for', ''), ',', 1)) = '203.0.113.13',
    'proxy_header_names', coalesce((
      select jsonb_agg(e.key order by e.key)
      from json_each(headers) as e(key, value)
      where e.key ~* '(^cf-|ip$|forward|real-ip|client-ip)'
        and e.key !~* '(authorization|apikey|cookie|token|secret|key)'
    ), '[]'::jsonb)
  );
end $$;

revoke all on function public.debug_ip_headers() from public;
grant execute on function public.debug_ip_headers() to anon, authenticated;
