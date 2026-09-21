-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Per-user progress for reading_test_sentences -- one row per (user_id, sentence_id) once the
-- student has Checked it, right or wrong (correct records which). A sentence with no row is still
-- pending, whether never attempted or reopened by "Retry the ones I got wrong" (which deletes its
-- wrong row -- see resetWrongAnswers in lib/data/readingTest.ts) -- so a sentence answered wrong
-- stays locked across a refresh/reopen too, same as a correct one, and only that explicit retry
-- action (not just reloading the page) gives it another attempt.
--
-- reading_test_passed() only ever counts correct=true rows -- it's the single source of truth for
-- "has this user 100%'d this test", reused by the katakana-gating triggers
-- (20260915_reading_test_gates_katakana.sql), by Settings' toggle gate, and by the dashboard's
-- stats.

create table public.user_reading_test_progress (
  id int8 generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  test_type text not null,
  sentence_id int8 not null references public.reading_test_sentences(id) on delete cascade,
  correct bool not null default true,
  user_answer text not null,
  attempted_at timestamptz not null default now(),
  constraint user_reading_test_progress_user_sentence_key unique (user_id, sentence_id)
);
create index idx_urtp_user_test on public.user_reading_test_progress (user_id, test_type);
alter table public.user_reading_test_progress enable row level security;

create policy "Users manage own user_reading_test_progress" on public.user_reading_test_progress
  as permissive for all
  using (((select auth.uid()) = user_id) and account_is_active(user_id))
  with check (((select auth.uid()) = user_id) and account_is_active(user_id));

create or replace function public.reading_test_passed(p_user_id uuid, p_test_type text)
returns boolean
language sql
stable
as $function$
  select
    (select count(*) from public.reading_test_sentences where test_type = p_test_type) > 0
    and (select count(*) from public.reading_test_sentences where test_type = p_test_type)
        <= (select count(*) from public.user_reading_test_progress
            where user_id = p_user_id and test_type = p_test_type and correct);
$function$;
