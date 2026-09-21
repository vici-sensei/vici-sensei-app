-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_today_activity_counts isn't explicitly named in the kana plan's RPC list, but
-- the dashboard pieces the plan does call for (NewHiraganaCard/NewKatakanaCard's
-- new_hiragana_today/new_katakana_today, DashboardHero's due-today counts on the
-- kana track) all read from it, same as the kanji/vocabulary ones do today -- so it
-- needs the same two-column extension, plus due_today/due_learning gated by
-- study_track (mirroring get_due_cards) so the dashboard's "cards to do today"
-- never counts a track's cards the student can't actually reach from /study.
--
-- Return type is gaining columns, which CREATE OR REPLACE can't do in place --
-- same reason submit_review/get_due_cards needed an explicit drop first.
drop function if exists public.get_today_activity_counts(uuid, text);

create function public.get_today_activity_counts(p_user_id uuid, p_timezone text default 'UTC')
returns table(
  due_today integer, due_learning integer, reviewed_today integer,
  new_kanji_today integer, new_vocab_today integer,
  new_hiragana_today integer, new_katakana_today integer
)
language plpgsql
stable
as $function$
declare
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
  v_study_track text;
begin
  select study_track into v_study_track from public.user_study_settings where user_id = p_user_id;

  return query
  select
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status != 'suspended')
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended') +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status != 'suspended')
      else 0 end
    )::integer,
    (
      case when v_study_track = 'standard' then
        (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_kanji_reading_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning'))
      else 0 end
      +
      case when v_study_track = 'kana' then
        (select count(*) from public.user_hiragana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning')) +
        (select count(*) from public.user_katakana_progress where user_id = p_user_id and due_at <= now() and status in ('learning','relearning'))
      else 0 end
    )::integer,
    (select count(*) from public.review_logs where user_id = p_user_id and undone = false and reviewed_at >= v_day_start and reviewed_at < v_day_end)::integer,
    (select count(*) from public.user_kanji_meaning_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_vocabulary_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id and created_at >= v_day_start and created_at < v_day_end)::integer;
end;
$function$;
