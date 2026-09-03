-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Renames public.user_badges -> public.test_status and demotes it from "the badge itself" to an
-- internal status-tracking table: how far along a reading-test attempt is (attempt_number,
-- percent), nothing more. The user-facing badge is now two permanent achievements in
-- public.user_achievements (see 20260924_kana_achievements.sql for that table/award_achievement)
-- -- '<test_type>_test' (any completed attempt) and '<test_type>_test_100' (a 100% attempt) --
-- so every badge shown in Settings > Badges comes from one place (user_achievements) instead of
-- two different tables with two different shapes.
--
-- badge_key is dropped along with it -- it only ever existed as 'reading_test_' || test_type to
-- key the old badge catalog, and test_type alone is now the natural per-user key (one status row
-- per (user_id, test_type), same as before).
alter table public.user_badges rename to test_status;
alter table public.test_status rename constraint user_badges_pkey to test_status_pkey;
alter table public.test_status rename constraint user_badges_user_id_fkey to test_status_user_id_fkey;
alter index public.idx_user_badges_user rename to idx_test_status_user;

alter table public.test_status drop constraint user_badges_user_badge_key_key;
alter table public.test_status drop column badge_key;
alter table public.test_status add constraint test_status_user_test_type_key unique (user_id, test_type);

alter policy "Users view own user_badges" on public.test_status rename to "Users view own test_status";

drop trigger reading_test_progress_updates_badge_trigger on public.user_reading_test_progress;
drop function public.reading_test_progress_updates_badge();

-- Same "every sentence answered" completion check as before, upserting into test_status instead
-- of user_badges -- plus now also awarding the two achievements this test_type's percent has
-- earned. award_achievement is insert-only (on conflict do nothing, see
-- 20260924_kana_achievements.sql), so '<test_type>_test_100' stays earned even if a later retry
-- scores lower -- same "can't regress once earned" guarantee the old badge_key row's
-- gold-once-100% coloring gave.
create or replace function public.reading_test_progress_updates_status()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
  v_answered int;
  v_correct int;
  v_percent int;
begin
  select count(*) into v_total from public.test where test_type = new.test_type;
  select count(*), count(*) filter (where correct) into v_answered, v_correct
    from public.user_reading_test_progress
    where user_id = new.user_id and test_type = new.test_type;

  if v_total = 0 or v_answered < v_total then
    return new;
  end if;

  v_percent := round(v_correct * 100.0 / v_total)::int;

  insert into public.test_status (user_id, test_type, attempt_number, percent, earned_at, updated_at)
  values (
    new.user_id,
    new.test_type,
    public.reading_test_current_attempt(new.user_id, new.test_type),
    v_percent,
    now(),
    now()
  )
  on conflict (user_id, test_type) do update
  set attempt_number = excluded.attempt_number,
      percent = excluded.percent,
      updated_at = now();

  perform public.award_achievement(new.user_id, new.test_type || '_test');
  if v_percent >= 100 then
    perform public.award_achievement(new.user_id, new.test_type || '_test_100');
  end if;

  return new;
end;
$function$;

create trigger reading_test_progress_updates_status_trigger
  after insert or update on public.user_reading_test_progress
  for each row execute function public.reading_test_progress_updates_status();

-- One-time backfill: renaming user_badges -> test_status didn't re-fire the trigger, so any row
-- that existed before this migration (i.e. every reading-test badge anyone had already earned)
-- has no matching achievement yet. award_achievement is on-conflict-do-nothing, so this is safe
-- to run more than once.
do $$
declare
  v_row record;
begin
  for v_row in select user_id, test_type, percent from public.test_status loop
    perform public.award_achievement(v_row.user_id, v_row.test_type || '_test');
    if v_row.percent >= 100 then
      perform public.award_achievement(v_row.user_id, v_row.test_type || '_test_100');
    end if;
  end loop;
end;
$$;
