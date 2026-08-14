-- Run this manually in the Supabase SQL editor.
--
-- Backs the dashboard's level-progress rings: for the student's current
-- JLPT level, how many kanji, kanji-reading words (the vocabulary entries
-- used to drill a kanji's reading -- see kanji_detail_words /
-- get_kanji_detail_words), and standalone vocabulary have been introduced
-- at least once ("seen") vs. graduated past the initial learning phase at
-- least once ("learned", status in review/relearning -- see
-- introduceKanji/introduceVocabulary in lib/data/introduce.ts for how rows
-- first get created with status 'new'), out of how many exist at that level
-- in total.
--
-- SECURITY INVOKER (the default), mirroring get_retention_rate /
-- get_review_streak (20260802_retention_rate_rpc.sql,
-- 20260718_query_functions.sql): RLS on the progress tables already scopes
-- rows to auth.uid(), so p_user_id can only ever resolve to the caller's own
-- data.

drop function if exists public.get_level_progress(uuid, text);

create or replace function public.get_level_progress(p_user_id uuid, p_level text)
 returns table(category text, seen bigint, learned bigint, total bigint)
 language sql
 stable
as $function$
  select 'kanji'::text as category,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level) as seen,
    (select count(*) from public.user_kanji_meaning_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji where level = p_level) as total

  union all

  select 'kanji_reading'::text,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level) as seen,
    (select count(*) from public.user_kanji_reading_progress p
       join public.kanji k on k.id = p.kanji_id
       where p.user_id = p_user_id and k.level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.kanji_detail_words kdw
       join public.kanji k on k.id = kdw.kanji_id
       where k.level = p_level) as total

  union all

  select 'vocabulary'::text,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level) as seen,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.vocabulary where jlpt_level = p_level) as total;
$function$
;

grant execute on function public.get_level_progress(uuid, text) to authenticated;
