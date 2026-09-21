-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Resume state for an in-progress reading test pass: the frozen shuffled question order for the
-- current pass, which position in it the student is on, whether they've gotten past the Start
-- screen at all, and the in-progress (not yet Checked) draft answer for whichever sentence they're
-- currently on. All of it lives on user_reading_test_attempts (already one row per user+test)
-- instead of a new table, since it's all scoped to "this attempt" the same way attempt_number is.
--
-- queue_order is the full pending-sentence-id set at the moment this pass started, shuffled once
-- and then fixed for the rest of the pass (see ReadingTestPage's passQueueIds) -- it does not
-- shrink as sentences get answered, same as before; queue_position is how far into it the student
-- has advanced (only bumped by Next, not by Check, so a refresh between Check and Next still shows
-- the just-answered result screen instead of skipping it). started survives retries (once true,
-- always true -- matches the old per-tab sessionStorage flag it replaces), but queue_order/
-- queue_position/draft_* get cleared on retry by reading_test_retry_wrong below, since a retry's
-- pending set is a different, smaller pass.

alter table public.user_reading_test_attempts
  add column started boolean not null default false,
  add column queue_order bigint[],
  add column queue_position int4 not null default 0,
  add column draft_sentence_id int8 references public.test(id) on delete set null,
  add column draft_answer text not null default '',
  add column draft_updated_at timestamptz;

-- Atomically returns this pass's frozen queue, creating the row (and setting queue_order) the
-- first time it's needed, or after a retry cleared it -- never overwrites an already-set
-- queue_order, so two devices racing to freeze the same pass can't clobber each other's shuffle
-- order (whichever insert/update lands first wins; the loser just gets that one back).
create or replace function public.reading_test_ensure_queue(p_user_id uuid, p_test_type text, p_queue bigint[])
returns bigint[]
language plpgsql
as $function$
declare
  v_queue bigint[];
begin
  insert into public.user_reading_test_attempts (user_id, test_type, queue_order)
  values (p_user_id, p_test_type, p_queue)
  on conflict (user_id, test_type) do update
  set queue_order = coalesce(public.user_reading_test_attempts.queue_order, excluded.queue_order)
  returning queue_order into v_queue;
  return v_queue;
end;
$function$;

-- Reopening the wrong sentences now also has to clear this pass's resume state, since the new
-- pass's pending set is different -- keeping the old queue_order/queue_position around would point
-- at sentences that aren't part of this retry at all. started is left untouched: once true it
-- stays true, same as the sessionStorage flag it replaces, so a retry never re-shows the intro
-- screen.
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
  set attempt_number = public.user_reading_test_attempts.attempt_number + 1,
      updated_at = now(),
      queue_order = null,
      queue_position = 0,
      draft_sentence_id = null,
      draft_answer = '',
      draft_updated_at = null;
end;
$function$;
