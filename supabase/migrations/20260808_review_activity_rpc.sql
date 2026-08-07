-- Run this manually in DBeaver or the Supabase SQL editor (after 20260718_query_functions.sql).
--
-- Per-day activity for the last N days (default 7), timezone-aware so "today" and day
-- boundaries match the user's local midnight rather than the server's UTC clock -- same
-- rationale as utcDayBounds() in lib/srs/day.ts, but get_review_streak (function 4 in
-- 20260718_query_functions.sql) predates that convention and still walks current_date
-- server-side; left as-is here to avoid changing the existing streak number.
--
-- This is deliberately separate from get_review_streak: this function reports raw per-day
-- activity (did the user study on day X, regardless of gaps before/after), used to color a
-- 7-day strip, while get_review_streak reports the current unbroken run ending today, used
-- for the "Day streak" number. The two can disagree -- e.g. a day studied a week ago shows
-- colored here even though it's no longer part of the current streak -- that's intentional.

create or replace function public.get_review_activity(
  p_user_id uuid,
  p_timezone text,
  p_days integer default 7
)
returns table (
  day date,
  has_activity boolean
)
language sql
stable
as $$
  with days as (
    select generate_series(
      (now() at time zone p_timezone)::date - (p_days - 1),
      (now() at time zone p_timezone)::date,
      interval '1 day'
    )::date as day
  )
  select
    d.day,
    exists (
      select 1 from public.review_logs r
      where r.user_id = p_user_id
        and r.undone = false
        and (r.reviewed_at at time zone p_timezone)::date = d.day
    ) as has_activity
  from days d
  order by d.day asc;
$$;

grant execute on function public.get_review_activity(uuid, text, integer) to authenticated;
