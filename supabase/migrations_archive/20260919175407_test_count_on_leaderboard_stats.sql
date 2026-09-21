-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Simpler alternative to a per-answer log table for the admin "Test" column: the only thing that
-- column ever needs is a per-day (and lifetime) COUNT of questions answered, retries included --
-- not which sentence, not what was typed. leaderboard_stats_on_reading_test already fires on
-- every insert into user_reading_test_progress, and that already happens once per question
-- answered INCLUDING retries -- reading_test_retry_wrong deletes a wrong row so the sentence's
-- next Check is a genuine insert, not a no-op (on conflict do nothing only short-circuits a
-- second write to a row that's still there). So the same trigger that already turns each answer
-- into XP can just as easily turn it into a running count, the same way reviews_count/
-- new_cards_count already work -- no new table needed.

alter table public.leaderboard_stats add column if not exists test_count bigint not null default 0;
alter table public.leaderboard_daily_stats add column if not exists test_count bigint not null default 0;

-- Reverted back to its original (20261109_reading_test_submit_answer_first_write_wins.sql) body --
-- the brief detour through a reading_test_answer_logs insert here is undone below, before that
-- table is dropped.
create or replace function public.reading_test_submit_answer(
  p_user_id uuid, p_test_type text, p_sentence_id int8, p_correct bool, p_user_answer text
)
returns table (correct bool, user_answer text)
language plpgsql
as $function$
begin
  insert into public.user_reading_test_progress (user_id, test_type, sentence_id, correct, user_answer, attempted_at)
  values (p_user_id, p_test_type, p_sentence_id, p_correct, p_user_answer, now())
  on conflict (user_id, sentence_id) do nothing;

  return query
  select p.correct, p.user_answer
  from public.user_reading_test_progress p
  where p.user_id = p_user_id and p.sentence_id = p_sentence_id;
end;
$function$;

create or replace function public.leaderboard_stats_on_reading_test()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_tz text;
  v_day date;
  v_xp integer := case when new.correct then 25 else 2 end;
begin
  select timezone into v_tz from public.user_study_settings where user_id = new.user_id;
  v_day := public.study_day(new.attempted_at, coalesce(v_tz, 'UTC'));

  insert into public.leaderboard_stats as ls
    (user_id, xp_points, test_count, current_streak, longest_streak, last_active_date)
  values (new.user_id, v_xp, 1, 1, 1, v_day)
  on conflict (user_id) do update
  set xp_points = ls.xp_points + v_xp,
      test_count = ls.test_count + 1,
      current_streak = public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day),
      longest_streak = greatest(
        ls.longest_streak,
        public.leaderboard_bump_streak(ls.current_streak, ls.last_active_date, v_day)
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, xp_points, test_count)
  values (new.user_id, v_day, v_xp, 1)
  on conflict (user_id, day) do update
  set xp_points = lds.xp_points + v_xp,
      test_count = lds.test_count + 1;

  return new;
end;
$function$;

-- test_count now comes straight out of leaderboard_daily_stats, same as reviews_count/
-- new_cards_count/xp_points -- no separate log/CTE/join needed.
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
    select lds.day, lds.reviews_count, lds.new_cards_count, lds.test_count, lds.xp_points
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
  days as (
    select day from base
    union select day from learned
    union select day from practice
  )
  select
    d.day,
    coalesce(b.reviews_count, 0),
    coalesce(b.new_cards_count, 0),
    coalesce(l.learned_count, 0),
    coalesce(p.practice_count, 0),
    coalesce(b.test_count, 0),
    coalesce(b.xp_points, 0)
  from days d
  left join base b on b.day = d.day
  left join learned l on l.day = d.day
  left join practice p on p.day = d.day
  order by d.day desc;
$$;

grant execute on function public.get_student_daily_activity(uuid) to authenticated;

-- get_admin_student_roster's lifetime test_count now reads straight off leaderboard_stats too.
create or replace function public.get_admin_student_roster()
returns table(
  id uuid,
  display_name text,
  email text,
  avatar_url text,
  country text,
  is_premium boolean,
  created_at timestamptz,
  current_streak integer,
  longest_streak integer,
  last_active_date date,
  reviews_count bigint,
  new_cards_count bigint,
  learned_count bigint,
  practice_count bigint,
  test_count bigint,
  xp_points bigint
)
language sql
stable
as $$
  select
    u.id, u.display_name, u.email, u.avatar_url, u.country, u.is_premium, u.created_at,
    coalesce(ls.current_streak, 0), coalesce(ls.longest_streak, 0), ls.last_active_date,
    coalesce(ls.reviews_count, 0), coalesce(ls.new_cards_count, 0),
    coalesce(learned.cnt, 0), coalesce(practice.cnt, 0), coalesce(ls.test_count, 0),
    coalesce(ls.xp_points, 0)
  from public.users u
  left join public.leaderboard_stats ls on ls.user_id = u.id
  left join (
    select user_id, count(*) as cnt from (
      select user_id from public.user_hiragana_progress where graduated_at is not null
      union all
      select user_id from public.user_katakana_progress where graduated_at is not null
    ) g group by user_id
  ) learned on learned.user_id = u.id
  left join (
    select user_id, count(*) as cnt from public.practice_logs group by user_id
  ) practice on practice.user_id = u.id;
$$;

grant execute on function public.get_admin_student_roster() to authenticated;

-- Cleanup: drop the per-answer log table from the earlier, more complex approach -- created and
-- immediately superseded within the same session, before anything ever read from it.
drop table if exists public.reading_test_answer_logs;
