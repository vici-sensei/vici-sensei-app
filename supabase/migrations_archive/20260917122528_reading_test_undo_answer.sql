-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Undo for the hiragana/katakana reading tests: while a just-Checked sentence's result is still
-- on screen (before Next moves the pass past it -- see reading_test_advance_queue), this lets the
-- student undo that Check and retype it, by deleting its user_reading_test_progress row so the
-- sentence goes back to pending. Unlike reading_test_retry_wrong ("Retry the ones I got wrong" on
-- the summary page), this never touches attempt_number/queue_position/draft_* -- it's a correction
-- within the same pass, not a new attempt -- and, like undo_review does for the SRS queue
-- (20260911_drill_mode_and_atomic_undo.sql), it leaves whatever XP/streak credit
-- leaderboard_stats_reading_test_trigger already awarded in place rather than trying to claw it
-- back.
--
-- Scoped to (user_id, test_type, sentence_id), same shape as every other reading-test RPC; RLS on
-- user_reading_test_progress ("Users manage own...") is what actually keeps this to the caller's
-- own rows.
create or replace function public.reading_test_undo_answer(p_user_id uuid, p_test_type text, p_sentence_id int8)
returns void
language plpgsql
as $function$
begin
  delete from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and sentence_id = p_sentence_id;
end;
$function$;
