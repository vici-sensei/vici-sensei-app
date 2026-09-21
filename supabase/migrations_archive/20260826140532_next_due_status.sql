-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds next_due_status to get_next_due's result -- the status of the specific row that owns
-- next_due_at -- so callers can tell apart two very different kinds of "one more card is
-- coming soon": a learning/relearning row resurfacing from an SRS retry the user already
-- triggered this session (not new information -- they just got it wrong and saw it re-added to
-- their queue instantly, see 20260901_submit_review_resurfaces_today.sql) vs. a review-phase
-- row becoming due from a schedule set days ago (genuinely new information, worth surfacing).
-- See DashboardHero.tsx's "Plus another card in Xs" hint, previously shown identically for
-- both cases.

drop function if exists public.get_next_due(uuid, text);

create or replace function public.get_next_due(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table(next_due_at timestamptz, next_due_is_today boolean, next_due_status text)
language plpgsql
stable
as $function$
declare
  v_next_due_at timestamptz;
  v_next_due_status text;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_end timestamptz := ((v_local_date::text)::timestamp at time zone p_timezone) + interval '1 day';
begin
  select due_at, status into v_next_due_at, v_next_due_status
  from (
    select due_at, status from public.user_kanji_meaning_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_kanji_reading_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at, status from public.user_vocabulary_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
  ) t
  order by due_at asc
  limit 1;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end), v_next_due_status;
end;
$function$;

grant execute on function public.get_next_due(uuid, text) to authenticated;
