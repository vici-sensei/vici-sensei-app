-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- fetchStudyQueue (lib/data/studyQueue.ts) and fetchStudyStats (lib/data/studyStats.ts) both
-- computed "today" client-side via utcDayBounds(new Date(), timezone) and used it, unvalidated,
-- in PostgREST count filters for due/reviewed/new-card-introduced counts. Read-only (the real
-- daily-cap enforcement is introduce_kanji/introduce_vocabulary), but still client-clock-trusted
-- business data shown to the user. Collapse into one server-computed RPC.

create or replace function public.get_today_activity_counts(
  p_user_id uuid,
  p_timezone text default 'UTC'
)
returns table(
  due_today integer,
  due_learning integer,
  reviewed_today integer,
  new_kanji_today integer,
  new_vocab_today integer
)
language plpgsql
stable
as $function$
declare
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  return query
  select
    (
      (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
      (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
      (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status != 'suspended')
    )::integer,
    (
      (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
      (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
      (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning'))
    )::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;

grant execute on function public.get_today_activity_counts(uuid, text) to authenticated;
