-- Removes the temporary header probe. cf-connecting-ip does arrive on Data API
-- requests and a client cannot set it, so private.client_ip() stays as it is.

drop function if exists public.debug_ip_headers();
