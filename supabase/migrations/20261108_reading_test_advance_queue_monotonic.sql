-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a two-device race on queue_position (20261106_reading_test_resume_state.sql): advance was
-- a plain upsert that unconditionally overwrote queue_position, so if device A (further along)
-- and device B (behind, working off a session fetched before A's latest advance) both hit Next
-- around the same time, whichever write lands last wins -- B's stale, lower position could clobber
-- A's, walking the saved progress backwards. queue_order already avoids the equivalent problem via
-- coalesce (never overwrite an already-set value); position needs the same treatment but can't use
-- coalesce since it's never null, so this takes the greatest of the two instead -- a position can
-- only ever move forward, never regress, no matter which device's write lands last.
create or replace function public.reading_test_advance_queue(p_user_id uuid, p_test_type text, p_position int4)
returns int4
language plpgsql
as $function$
declare
  v_position int4;
begin
  insert into public.user_reading_test_attempts (user_id, test_type, queue_position)
  values (p_user_id, p_test_type, p_position)
  on conflict (user_id, test_type) do update
  set queue_position = greatest(public.user_reading_test_attempts.queue_position, excluded.queue_position)
  returning queue_position into v_position;
  return v_position;
end;
$function$;
