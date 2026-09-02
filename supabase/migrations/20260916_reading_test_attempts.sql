-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Tracks which attempt of a reading test the user is currently on. Attempt 1 is implicit (no row
-- yet -- see reading_test_current_attempt below); each "Retry the ones I got wrong" (summary
-- page) bumps it by one via reading_test_retry_wrong, which does the retry's delete and the bump
-- atomically so a refresh mid-retry can't leave the two out of sync.

create table public.user_reading_test_attempts (
  user_id uuid not null references public.users(id) on delete cascade,
  test_type text not null,
  attempt_number int4 not null default 1,
  updated_at timestamptz not null default now(),
  primary key (user_id, test_type)
);
alter table public.user_reading_test_attempts enable row level security;

create policy "Users manage own user_reading_test_attempts" on public.user_reading_test_attempts
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

-- Current attempt number for a user/test -- 1 if no row exists yet (never retried).
create or replace function public.reading_test_current_attempt(p_user_id uuid, p_test_type text)
returns int
language sql
stable
as $function$
  select coalesce(
    (select attempt_number from public.user_reading_test_attempts
     where user_id = p_user_id and test_type = p_test_type),
    1
  );
$function$;

-- Replaces the client's old plain delete (lib/data/readingTest.ts's resetWrongAnswers) -- bumping
-- the attempt counter has to happen in the same statement as reopening the wrong sentences, or a
-- page refresh between the two could reopen sentences without ever recording the new attempt.
create or replace function public.reading_test_retry_wrong(p_user_id uuid, p_test_type text)
returns void
language plpgsql
as $function$
begin
  delete from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and correct = false;

  insert into public.user_reading_test_attempts (user_id, test_type, attempt_number, updated_at)
  values (p_user_id, p_test_type, 2, now())
  on conflict (user_id, test_type) do update
  set attempt_number = public.user_reading_test_attempts.attempt_number + 1, updated_at = now();
end;
$function$;
