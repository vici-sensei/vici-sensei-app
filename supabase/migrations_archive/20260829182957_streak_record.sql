-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds a "record" (longest-ever day streak) alongside the existing current_streak on
-- leaderboard_stats, for the dashboard's "Day streak" card. Kept on leaderboard_stats
-- rather than recomputed from review_logs on every stats poll (like get_review_streak
-- used to before 20260819_review_streak_set_based.sql) so this stays O(1): the insert
-- trigger below just tracks a running max next to the running current_streak it already
-- maintains, instead of rescanning history.
--
-- No real users yet, so no backfill needed -- longest_streak starts at 0 for everyone
-- and grows naturally from here.
alter table public.leaderboard_stats
  add column if not exists longest_streak int4 default 0 not null;

-- Same current_streak expression as before (20260819_review_streak_set_based.sql's
-- comment explains the day-gap logic), just also folded into longest_streak via
-- greatest() so a new personal best is captured the moment it happens. Duplicated
-- rather than computed once because a single INSERT ... ON CONFLICT DO UPDATE SET
-- can't have one assignment reference another assignment's new value -- every
-- expression in the SET list sees the same pre-update row.
--
-- Undo intentionally does NOT touch longest_streak (see
-- leaderboard_stats_on_review_undo below, unchanged) -- a record you already hit stays
-- your record even if you later undo a review; only the live current_streak needs to
-- reflect the corrected history.
create or replace function public.leaderboard_stats_on_review_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_day date := new.reviewed_at::date;
  v_xp integer := case when new.correct then 10 else 2 end;
begin
  insert into public.leaderboard_stats as ls
    (user_id, reviews_count, xp_points, current_streak, longest_streak, last_active_date)
  values (new.user_id, 1, v_xp, 1, 1, v_day)
  on conflict (user_id) do update
  set reviews_count = ls.reviews_count + 1,
      xp_points = ls.xp_points + v_xp,
      current_streak = case
        when ls.last_active_date is null or v_day > ls.last_active_date then
          case when v_day = ls.last_active_date + 1 then ls.current_streak + 1 else 1 end
        else ls.current_streak
      end,
      longest_streak = greatest(
        ls.longest_streak,
        case
          when ls.last_active_date is null or v_day > ls.last_active_date then
            case when v_day = ls.last_active_date + 1 then ls.current_streak + 1 else 1 end
          else ls.current_streak
        end
      ),
      last_active_date = greatest(ls.last_active_date, v_day),
      updated_at = now();

  insert into public.leaderboard_daily_stats as lds (user_id, day, reviews_count, xp_points)
  values (new.user_id, v_day, 1, v_xp)
  on conflict (user_id, day) do update
  set reviews_count = lds.reviews_count + 1,
      xp_points = lds.xp_points + v_xp;

  return new;
end;
$function$;

-- Exposes longest_streak the same way current_streak reaches the client via
-- get_review_streak -- leaderboard_stats has RLS enabled with no policies (it's only
-- ever written by SECURITY DEFINER triggers), so a direct table select from the client
-- would return nothing. security definer bypasses that, so the auth.uid() check here is
-- the only thing standing between a caller and someone else's record -- unlike
-- get_review_streak, which gets that check for free from review_logs' own RLS policy.
create or replace function public.get_review_streak_record(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(longest_streak, 0)
  from public.leaderboard_stats
  where user_id = p_user_id
    and user_id = auth.uid();
$$;

grant execute on function public.get_review_streak_record(uuid) to authenticated;
