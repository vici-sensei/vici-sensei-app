-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a two-device race on user_reading_test_progress, the read-test analogue of
-- 20261108_reading_test_advance_queue_monotonic.sql: submitReadingTestAnswer was a plain upsert
-- that unconditionally overwrote correct/user_answer, so if device A answers a sentence (right or
-- wrong) and device B -- working off a progress fetch from before A's Check, so it still shows that
-- sentence as pending -- answers the *same* sentence afterwards, B's write silently clobbers A's
-- result. That lets a student peek at a sentence being wrong on one device and then "retry" it for
-- real on another, exactly the kind of do-over a real test shouldn't allow. The UI's own guard
-- (locking a sentence the moment it has any result) only ever saw its own device's copy of
-- progress, so it couldn't catch this.
--
-- Fix: route the write through this function instead of a raw upsert, using on conflict do nothing
-- so an existing row is never touched, then always return the row that's actually stored --
-- whichever device's Check landed first. The caller uses that returned (correct, user_answer) as
-- the authoritative result instead of assuming its own local Check succeeded.
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
