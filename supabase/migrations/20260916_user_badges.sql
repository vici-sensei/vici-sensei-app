-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Achievement badges (Steam-style: icon + title + description, resolved client-side from
-- badge_key -- see lib/badges/registry.tsx). One row per (user, badge_key): a badge is upserted
-- in place, not appended, so finishing another pass of the same test refreshes attempt_number/
-- percent instead of piling up duplicates -- per product request, a single reading-test badge
-- that keeps updating with the latest attempt, not a new one every time. earned_at is preserved
-- across updates (first time only); updated_at tracks the latest pass.
--
-- Only written by reading_test_progress_updates_badge below (security definer) -- no
-- insert/update/delete policy for users, so a badge stays a trustworthy record of what actually
-- happened rather than something the client could self-report.

create table public.user_badges (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  badge_key text not null,
  test_type text not null,
  attempt_number int4 not null,
  percent int4 not null,
  earned_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_badges_user_badge_key_key unique (user_id, badge_key)
);
create index idx_user_badges_user on public.user_badges (user_id);
alter table public.user_badges enable row level security;

create policy "Users view own user_badges" on public.user_badges
  as permissive for select
  using (((select auth.uid()) = user_id) and account_is_active(user_id));

-- Fires on every reading-test answer. Once every sentence for this test_type has a result (right
-- or wrong -- the same "finished" condition reading_test_passed checks, just without requiring
-- every one to be correct), upserts this test's badge with the just-finished attempt's number and
-- score. Runs on every completed pass, not only a 100% one -- percent trends up over retries since
-- "Retry the ones I got wrong" only reopens wrong sentences, so it can't regress once earned.
create or replace function public.reading_test_progress_updates_badge()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_total int;
  v_answered int;
  v_correct int;
begin
  select count(*) into v_total from public.reading_test_sentences where test_type = new.test_type;
  select count(*), count(*) filter (where correct) into v_answered, v_correct
    from public.user_reading_test_progress
    where user_id = new.user_id and test_type = new.test_type;

  if v_total = 0 or v_answered < v_total then
    return new;
  end if;

  insert into public.user_badges (user_id, badge_key, test_type, attempt_number, percent, earned_at, updated_at)
  values (
    new.user_id,
    'reading_test_' || new.test_type,
    new.test_type,
    public.reading_test_current_attempt(new.user_id, new.test_type),
    round(v_correct * 100.0 / v_total)::int,
    now(),
    now()
  )
  on conflict (user_id, badge_key) do update
  set test_type = excluded.test_type,
      attempt_number = excluded.attempt_number,
      percent = excluded.percent,
      updated_at = now();

  return new;
end;
$function$;

create trigger reading_test_progress_updates_badge_trigger
  after insert or update on public.user_reading_test_progress
  for each row execute function public.reading_test_progress_updates_badge();
