-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- study_day_range: the inverse of study_day_bounds (20260903_study_day_6am_boundary.sql) --
-- study_day_bounds takes an instant (p_at, default now()) and returns the [day_start, day_end)
-- window of whichever study day it falls in; this instead takes a study-day DATE directly (e.g.
-- the "day" label get_student_daily_activity already returns) and returns that exact day's
-- [day_start, day_end), without re-deriving the date from an arbitrary anchor instant -- which
-- isn't safe to fake (a noon-UTC anchor lands on the wrong calendar day once shifted by 6h and an
-- extreme-enough timezone offset, e.g. UTC-12).
--
-- Lets the admin student detail page's per-day drill-down (fetchStudentActivityForDay) query
-- review_logs/practice_logs/graduated_at/etc for the same 6am-local-to-the-student window the
-- daily activity table's own row already used, instead of a naive UTC midnight-to-midnight
-- boundary that could mis-attribute anything answered between midnight and 6am local, or between
-- 6am UTC and 6am local on either edge.
create or replace function public.study_day_range(p_day date, p_timezone text default 'UTC', p_offset_hours integer default 6)
returns table (day_start timestamptz, day_end timestamptz)
language sql
stable
as $$
  select
    (p_day::timestamp + make_interval(hours => p_offset_hours)) at time zone p_timezone,
    (p_day::timestamp + make_interval(hours => p_offset_hours)) at time zone p_timezone + interval '1 day'
$$;

grant execute on function public.study_day_range(date, text, integer) to authenticated;
