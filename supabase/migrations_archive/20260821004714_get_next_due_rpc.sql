-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- lib/srs/nextDue.ts's getNextDue() took a client-computed nowIso (used in `due_at > nowIso`)
-- and did `utcDayBounds(new Date(), timezone)` client-side to decide next_due_is_today --
-- another client-clock-trusted business-logic value. Move both server-side: one RPC that
-- finds the earliest future due_at across all three progress tables and checks it against
-- today's local day-end, using now()/p_timezone instead of any client-supplied instant.

create or replace function public.get_next_due(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table(next_due_at timestamptz, next_due_is_today boolean)
language plpgsql
stable
as $function$
declare
  v_next_due_at timestamptz;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_end timestamptz := ((v_local_date::text)::timestamp at time zone p_timezone) + interval '1 day';
begin
  select min(due_at) into v_next_due_at
  from (
    select due_at from public.user_kanji_meaning_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_kanji_reading_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
    union all
    select due_at from public.user_vocabulary_progress
      where user_id = p_user_id and due_at > now() and status != 'suspended'
  ) t;

  return query select v_next_due_at, (v_next_due_at is not null and v_next_due_at < v_day_end);
end;
$function$;

grant execute on function public.get_next_due(uuid, text) to authenticated;
