-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The /study progress bar ("completed / total") used to compute `total` purely from what's
-- already sitting in the client's queue array -- which, for a "New kanji"/"New vocabulary"
-- candidate, is just the ONE candidate card itself, since the kanji_meaning/kanji_reading or
-- vocab_meaning rows it will produce don't exist in the database yet. The result: tapping
-- "New kanji" (which hands off its whole bundle instantly -- see
-- 20260828_pair_new_kanji_with_intro_bundle.sql) made the bar's denominator jump abruptly (e.g.
-- "0/7" straight to "1/14") the moment the bundle materialized, even though the *number* of
-- word-reading cards a kanji will produce is fully knowable in advance -- it's exactly
-- get_kanji_detail_words(kanji_id)'s row count, the same query introduce_kanji itself already
-- uses to create those rows.
--
-- Fix: get_new_kanji_candidates now also returns word_count -- a cheap count against
-- kanji_detail_words, no join to vocabulary needed since only the count matters here (unlike
-- the deferred word *content* fetch used to render the candidate's own example-word list,
-- which stays separate and lazy for performance). The client (useStudyQueue.ts) uses this,
-- together with the plain 1-New-card-to-1-future-review-card relationship every other new_vocab/
-- new_hiragana/new_katakana candidate already has, to compute the WHOLE day's predicted total
-- up front, before any of those future cards are ever created -- so the bar's denominator is
-- accurate from the very first paint and never needs to jump for anything the app can already
-- see coming. (A card that only becomes due later because of an in-session retry -- the user
-- answered "Again" and it resurfaces after its learning-step delay -- genuinely can't be
-- predicted this way, and still grows the bar's total with the existing "+N" badge, same as
-- today.)

drop function if exists public.get_new_kanji_candidates(uuid, text[], integer);

create or replace function public.get_new_kanji_candidates(p_user_id uuid, p_enabled_levels text[], p_limit integer)
 returns table(id bigint, kanji text, meanings text[], level text, kun_readings text[], on_readings text[], word_count integer)
 language sql
 stable
as $function$
  select k.id, k.kanji, k.meanings, k.level, k.kun_readings, k.on_readings,
         (select count(*) from public.kanji_detail_words kdw where kdw.kanji_id = k.id)::integer as word_count
  from public.kanji k
  where k.level = any(p_enabled_levels)
    and not exists (
      select 1 from public.user_kanji_meaning_progress p
      where p.user_id = p_user_id and p.kanji_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'standard' and s.study_kanji
    )
  order by k.id asc
  limit p_limit;
$function$;

grant execute on function public.get_new_kanji_candidates(uuid, text[], integer) to authenticated;
