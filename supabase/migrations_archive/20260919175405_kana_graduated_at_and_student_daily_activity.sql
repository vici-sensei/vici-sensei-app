-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- 1. graduated_at: a durable, written-once timestamp for the exact moment a hiragana/katakana
--    graduates out of the post-introduction drill (drill_streak reaches 3 -- see
--    record_hiragana_drill_result/record_katakana_drill_result, last touched by
--    20261007_kana_drill_due_at_study_day.sql). Graduating already stamps last_reviewed_at, but
--    that column is overwritten by every subsequent normal review of the same character (see
--    submit_review, 20260820_submit_review_rpc.sql), so the graduation date itself was
--    unrecoverable within days of it happening. graduated_at is never touched by submit_review or
--    anything else, so it survives for as long as the row exists -- needed so the admin student
--    detail page can show, for any past day, exactly how many characters the student "learned"
--    (graduated) that day. Characters that already graduated before this migration keep
--    graduated_at = null; that date is already gone and can't be reconstructed.

alter table public.user_hiragana_progress add column if not exists graduated_at timestamptz;
alter table public.user_katakana_progress add column if not exists graduated_at timestamptz;

create or replace function public.record_hiragana_drill_result(p_user_id uuid, p_hiragana_id bigint, p_correct boolean, p_timezone text default 'UTC'::text)
returns table(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
begin
  select * into v_current from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id;

  if v_current is null then
    raise exception 'No progress found for this hiragana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This hiragana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_hiragana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_hiragana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), graduated_at = now(), updated_at = now()
    where id = v_current.id;
    -- The status='review' update above fires user_hiragana_progress_updates_achievements_trigger
    -- synchronously (AFTER UPDATE triggers complete before control returns here), so any
    -- newly-earned rows are already visible with earned_at >= v_before_ts (user_achievements.
    -- earned_at defaults to now(), which -- like v_before_ts -- is transaction-start-constant).
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_hiragana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$function$;

grant execute on function public.record_hiragana_drill_result(uuid, bigint, boolean, text) to authenticated;

create or replace function public.record_katakana_drill_result(p_user_id uuid, p_katakana_id bigint, p_correct boolean, p_timezone text default 'UTC'::text)
returns table(drill_streak integer, graduated boolean, newly_unlocked_achievements text[])
language plpgsql
as $function$
declare
  v_current record;
  v_streak integer;
  v_day_end timestamptz;
  v_before_ts timestamptz := now();
  v_new_achievements text[];
begin
  select * into v_current from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id;

  if v_current is null then
    raise exception 'No progress found for this katakana. Introduce it first.' using errcode = 'SR404';
  end if;
  if v_current.status != 'learning' then
    raise exception 'This katakana has already graduated past the drill' using errcode = 'SR400';
  end if;

  if not p_correct then
    update public.user_katakana_progress set drill_streak = 0, last_drilled_at = now(), updated_at = now()
      where id = v_current.id;
    return query select 0, false, '{}'::text[];
    return;
  end if;

  v_streak := v_current.drill_streak + 1;

  if v_streak >= 3 then
    select day_end into v_day_end from public.study_day_bounds(p_timezone);
    update public.user_katakana_progress set
      status = 'review', interval_days = 1, repetitions = repetitions + 1,
      learning_step = 0, drill_streak = v_streak, due_at = v_day_end,
      last_reviewed_at = now(), last_drilled_at = now(), graduated_at = now(), updated_at = now()
    where id = v_current.id;
    -- See record_hiragana_drill_result above for why v_before_ts/earned_at comparison is safe.
    select coalesce(array_agg(achievement_key order by earned_at), '{}'::text[])
      into v_new_achievements
      from public.user_achievements
      where user_id = p_user_id and earned_at >= v_before_ts;
    return query select v_streak, true, v_new_achievements;
    return;
  end if;

  update public.user_katakana_progress set drill_streak = v_streak, last_drilled_at = now(), updated_at = now()
    where id = v_current.id;
  return query select v_streak, false, '{}'::text[];
end;
$function$;

grant execute on function public.record_katakana_drill_result(uuid, bigint, boolean, text) to authenticated;

-- 2. get_student_daily_activity: one admin-page RPC replacing the plain leaderboard_daily_stats
--    select in fetchStudentDailyActivity, so the "Daily activity" calendar/table/list can show
--    every activity type (reviews, new cards, kana graduations, free practice, reading tests) on
--    the same per-day grid, bucketed the same way leaderboard_daily_stats.day already is (the
--    student's own study day -- see study_day/study_day_bounds, 20260903_study_day_6am_boundary.sql
--    -- not a naive UTC calendar date). Plain SQL, not security definer: relies entirely on RLS,
--    same convention as get_review_activity/get_streak_active_days, so it only ever returns rows
--    an admin (or the user themselves) is already allowed to see via each source table's own
--    policies (leaderboard_daily_stats, user_hiragana_progress, user_katakana_progress,
--    practice_logs, test_status, user_study_settings -- all already admin-readable per
--    20261112_admin_can_view_student_data.sql / 20261127_practice_counts_toward_streak_and_xp.sql).
create or replace function public.get_student_daily_activity(p_user_id uuid)
returns table(
  day date,
  reviews_count integer,
  new_cards_count integer,
  learned_count integer,
  practice_count integer,
  test_count integer,
  xp_points integer
)
language sql
stable
as $$
  with tz as (
    select coalesce((select timezone from public.user_study_settings where user_id = p_user_id), 'UTC') as tz
  ),
  base as (
    select lds.day, lds.reviews_count, lds.new_cards_count, lds.xp_points
    from public.leaderboard_daily_stats lds
    where lds.user_id = p_user_id
  ),
  learned as (
    select public.study_day(g.graduated_at, (select tz from tz)) as day, count(*)::integer as learned_count
    from (
      select graduated_at from public.user_hiragana_progress where user_id = p_user_id and graduated_at is not null
      union all
      select graduated_at from public.user_katakana_progress where user_id = p_user_id and graduated_at is not null
    ) g
    group by 1
  ),
  practice as (
    select public.study_day(pl.practiced_at, (select tz from tz)) as day, count(*)::integer as practice_count
    from public.practice_logs pl
    where pl.user_id = p_user_id
    group by 1
  ),
  test as (
    select public.study_day(ts.earned_at, (select tz from tz)) as day, count(*)::integer as test_count
    from public.test_status ts
    where ts.user_id = p_user_id
    group by 1
  ),
  days as (
    select day from base
    union select day from learned
    union select day from practice
    union select day from test
  )
  select
    d.day,
    coalesce(b.reviews_count, 0),
    coalesce(b.new_cards_count, 0),
    coalesce(l.learned_count, 0),
    coalesce(p.practice_count, 0),
    coalesce(t.test_count, 0),
    coalesce(b.xp_points, 0)
  from days d
  left join base b on b.day = d.day
  left join learned l on l.day = d.day
  left join practice p on p.day = d.day
  left join test t on t.day = d.day
  order by d.day desc;
$$;

grant execute on function public.get_student_daily_activity(uuid) to authenticated;
