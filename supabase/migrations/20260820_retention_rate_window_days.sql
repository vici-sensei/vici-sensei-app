-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_retention_rate took a client-computed p_window_start timestamptz
-- (new Date(Date.now() - 30*86400000).toISOString() in lib/data/studyStats.ts). A window
-- length (a duration) isn't a clock value, so it's fine to keep client-controlled -- but the
-- instant it's measured FROM must be the server's now(), not the client's.

drop function if exists public.get_retention_rate(uuid, timestamptz);

create function public.get_retention_rate(p_user_id uuid, p_window_days integer default 30)
returns numeric
language sql
stable
as $function$
  select case when count(*) = 0 then null else avg(correct::int)::numeric end
  from public.review_logs
  where user_id = p_user_id
    and undone = false
    and reviewed_at >= now() - (p_window_days || ' days')::interval;
$function$;

grant execute on function public.get_retention_rate(uuid, integer) to authenticated;
