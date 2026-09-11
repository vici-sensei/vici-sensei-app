-- One of four CTA states for a reading test, replacing a plain "has any attempt" flag: lets
-- DashboardHero distinguish a first pass in progress from a completed pass awaiting retry from a
-- retry pass in progress, so it can show the right verb ("Take"/"Continue"/"Retry"/"Continue your
-- retry") instead of just "attempted or not". Builds on reading_test_passed
-- (20260918_rename_reading_test_sentences_to_test.sql) and reading_test_current_attempt /
-- user_reading_test_attempts (20260916_reading_test_attempts.sql) -- specifically that table's
-- updated_at, which is bumped to now() exactly when the most recent retry started, so comparing
-- progress rows' attempted_at against it tells us whether anything's been answered since.
create or replace function public.reading_test_cta_state(p_user_id uuid, p_test_type text)
returns text
language plpgsql
stable
as $function$
declare
  v_total int;
  v_answered int;
  v_retry_started_at timestamptz;
  v_answered_since_retry int;
begin
  select count(*) into v_total from public.test where test_type = p_test_type;

  select count(*) into v_answered from public.user_reading_test_progress
  where user_id = p_user_id and test_type = p_test_type;

  if v_answered = 0 then
    return 'not_started';
  end if;

  select updated_at into v_retry_started_at
  from public.user_reading_test_attempts
  where user_id = p_user_id and test_type = p_test_type;

  -- Never retried yet -- still on, or just finished, the first pass.
  if v_retry_started_at is null then
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
