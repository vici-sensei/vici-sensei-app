-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes reading_test_cta_state (20261105_reading_test_cta_state.sql) misreporting a first pass
-- still in progress as 'retry_in_progress' ("Continue your retry"/"Almost there — finish
-- retrying..."). That function used user_reading_test_attempts.updated_at IS NULL as its "never
-- retried yet" check, which held until 20261106_reading_test_resume_state.sql added
-- reading_test_ensure_queue: that RPC now creates the same row on the very first pass too (to
-- freeze the queue order), so updated_at is set from the start of attempt 1 and is never null.
-- Once any answer landed after that row was created, the old check misread it as "answered since
-- the retry started" and jumped straight to retry_in_progress.
--
-- attempt_number (defaults to 1, only bumped by reading_test_retry_wrong) is what actually
-- distinguishes "just resumed the first pass" from "genuinely retried" -- switch to that instead.
create or replace function public.reading_test_cta_state(p_user_id uuid, p_test_type text)
returns text
language plpgsql
stable
as $function$
declare
  v_total int;
  v_answered int;
  v_attempt_number int;
  v_retry_started_at timestamptz;
  v_answered_since_retry int;
begin
  select count(*) into v_total from public.test where test_type = p_test_type;

  select count(*) into v_answered from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type;

  if v_answered = 0 then
    return 'not_started';
  end if;

  select attempt_number, updated_at into v_attempt_number, v_retry_started_at
  from public.user_reading_test_attempts
  where user_id = p_user_id and test_type = p_test_type;

  -- Never retried yet (no row, or attempt_number still 1) -- still on, or just finished, the
  -- first pass. A row can now exist without ever having retried -- reading_test_ensure_queue
  -- (20261106_reading_test_resume_state.sql) creates it to store the first pass's queue too -- so
  -- attempt_number, not row/updated_at presence, is what actually distinguishes "retried" from
  -- "just resumed".
  if v_attempt_number is null or v_attempt_number <= 1 then
    return case when v_answered < v_total then 'in_progress' else 'retry_pending' end;
  end if;

  select count(*) into v_answered_since_retry
  from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type and attempted_at > v_retry_started_at;

  -- Retried at least once, but nothing answered since -- ready to retry, not mid-retry (also
  -- where a fully-completed retry pass lands, looping back for the next round if still not passed).
  if v_answered_since_retry = 0 or v_answered >= v_total then
    return 'retry_pending';
  end if;

  return 'retry_in_progress';
end;
$function$;
