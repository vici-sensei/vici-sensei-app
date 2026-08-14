-- Run this manually in DBeaver or the Supabase SQL editor (after 20260814_leaderboards.sql).
--
-- The leaderboard's period boundaries (lib/leaderboard/period.ts) and "Resets
-- in ..." countdown are computed from the browser's system clock. If a
-- user's device clock is wrong -- fast, slow, or set to the wrong date
-- entirely -- that math goes wrong too: e.g. a clock a few hours ahead makes
-- "today" start in the future from the server's point of view, so
-- p_period_start ends up after every real review_logs row and the daily
-- leaderboard renders empty for that one user. A cheap scalar RPC lets the
-- client measure its clock's offset from the server once per page load and
-- correct for it everywhere it computes "now" -- see
-- lib/client-data/serverClockOffset.ts.

create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;

grant execute on function public.get_server_time() to authenticated;
