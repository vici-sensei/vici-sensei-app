-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets a student pick their own timezone ("Custom timezone" card on Settings -> Study) instead of
-- always using the one their browser reports. The study day (6 a.m. local), the daily "Max reviews
-- per day" limit, the streak and every leaderboard period all follow the student's timezone, and
-- until now that was silently whatever the browser said (studyStats.ts syncs it into
-- user_study_settings.timezone on every dashboard poll).
--
-- Two new columns, so a pick survives the toggle being switched off and back on:
--   timezone_preference_enabled  boolean, default false -- the toggle
--   preferred_timezone           text, null             -- the IANA name they picked
-- (enabled requires a pick -- see the CHECK below.)
--
-- user_study_settings.timezone stays THE effective timezone every trigger and RPC already reads:
--   * while the preference is on, a trigger keeps it equal to preferred_timezone (so toggling it,
--     or changing the pick, re-buckets the leaderboards immediately, atomically with the save);
--   * while it's off, it's the browser's, synced by set_user_timezone exactly as before.
--
-- set_user_timezone now leaves the row alone while the preference is on, so a stale tab or an old
-- cached client can't overwrite the pick with the browser's timezone.
--
-- resolve_user_timezone (20261242) used to let an explicit p_timezone win over the saved one, so a
-- client that still sent the browser's timezone would have been bucketed differently from one that
-- sent the pick. While the preference is on the pick now wins over whatever the caller sends; with
-- it off the order is unchanged (explicit, then saved, then 'UTC'). That covers get_daily_review_budget,
-- get_servable_due_rows, get_today_activity_counts, get_next_due and leaderboard_period_end -- the
-- RPCs that take a timezone and resolve it through this function. The rest (streak, drills,
-- introduce_*) still use whatever the client sends, which is the same effective timezone.
--
-- An unknown name is rejected on save (a CHECK can't look at pg_timezone_names, a trigger can): the
-- saved value is read by every leaderboard trigger, where study_day(..., 'Not/AZone') raises and
-- would make that student's reviews fail to submit.
--
-- Additive and wrapped in one transaction. Every existing row gets enabled = false, so nobody's
-- behavior changes until they switch it on.

begin;

alter table public.user_study_settings
  add column if not exists timezone_preference_enabled boolean not null default false,
  add column if not exists preferred_timezone text;

alter table public.user_study_settings
  drop constraint if exists user_study_settings_timezone_preference_check;
alter table public.user_study_settings
  add constraint user_study_settings_timezone_preference_check
  check (not timezone_preference_enabled or preferred_timezone is not null);

comment on column public.user_study_settings.timezone_preference_enabled is 'When true, the study day, daily limits, streak and leaderboards use preferred_timezone instead of the timezone the browser reports. Default false = follow the browser.';
comment on column public.user_study_settings.preferred_timezone is 'IANA timezone name the student picked in Settings -> Study. Kept while timezone_preference_enabled is false so switching it back on restores the pick. Only takes effect while timezone_preference_enabled is true.';

create or replace function public.apply_timezone_preference()
 returns trigger
 language plpgsql
as $function$
begin
  if new.preferred_timezone is not null
     and not exists (select 1 from pg_catalog.pg_timezone_names n where n.name = new.preferred_timezone) then
    raise exception 'Unknown timezone: %', new.preferred_timezone using errcode = '22023';
  end if;

  -- The effective timezone follows the pick while the preference is on. When it's off, `timezone`
  -- is left to set_user_timezone (the browser's), untouched here.
  if new.timezone_preference_enabled then
    new.timezone := new.preferred_timezone;
  end if;

  return new;
end;
$function$;

drop trigger if exists apply_timezone_preference_trigger on public.user_study_settings;
create trigger apply_timezone_preference_trigger
  before insert or update on public.user_study_settings
  for each row execute function public.apply_timezone_preference();

create or replace function public.resolve_user_timezone(p_user_id uuid, p_timezone text default null)
 returns text
 language sql
 stable
as $function$
  select coalesce(
    (select s.preferred_timezone from public.user_study_settings s where s.user_id = p_user_id and s.timezone_preference_enabled),
    nullif(p_timezone, ''),
    (select s.timezone from public.user_study_settings s where s.user_id = p_user_id),
    'UTC'
  );
$function$;

create or replace function public.set_user_timezone(p_user_id uuid, p_timezone text)
 returns void
 language sql
as $function$
  update public.user_study_settings
  set timezone = p_timezone, updated_at = now()
  where user_id = p_user_id
    and not timezone_preference_enabled
    and timezone is distinct from p_timezone
    and (p_timezone is null or exists (select 1 from pg_catalog.pg_timezone_names n where n.name = p_timezone));
$function$;

commit;
