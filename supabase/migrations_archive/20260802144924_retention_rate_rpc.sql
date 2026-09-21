-- Run this manually in the Supabase SQL editor.
--
-- GET /api/study/stats previously pulled every review_logs row in the
-- 30-day retention window (no .limit()) just to compute correct/total in
-- JS. Replace with a SQL aggregate, mirroring get_review_streak
-- (20260718_query_functions.sql): SECURITY INVOKER (the default), so RLS on
-- review_logs still applies through the authenticated role.
--
-- Returns null (not 0) when there are no reviews in the window, matching the
-- existing "N/A" behavior in the app for a user with no review history.

create or replace function public.get_retention_rate(p_user_id uuid, p_window_start timestamptz)
returns numeric
language sql
stable
as $$
  select case when count(*) = 0 then null else avg(correct::int)::numeric end
  from public.review_logs
  where user_id = p_user_id
    and undone = false
    and reviewed_at >= p_window_start;
$$;

grant execute on function public.get_retention_rate(uuid, timestamptz) to authenticated;
