-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Dashboard's kana-track level-progress card is splitting into two cards (hiragana, katakana),
-- each with one ring per kana_type (seion, dakuten, handakuten, yoon, sokuon, n_gemination, and
-- katakana-only choonpu/extended) instead of a single aggregate ring per script -- per user
-- request. get_level_progress gains one category row per {script}_{kana_type} combination so the
-- dashboard can render that breakdown without an extra round trip. The existing hiragana_reading/
-- katakana_reading rows (aggregated across every kana_type) are untouched -- /progress and any
-- other caller keep working exactly as before.
--
-- Same shape/denominator convention as hiragana_reading/katakana_reading
-- (20260906_mastery_denominators_respect_study_enabled.sql): total excludes entry_kind = 'rule'
-- (rule intro cards are never graded, see user_hiragana_rule_progress/user_katakana_rule_progress)
-- and rows with study_enabled = false (can never gain a progress row at all, see that migration's
-- comment for why leaving them counted would make 100% unreachable).

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
    (select count(*) from public.vocabulary where jlpt_level = p_level) as total

  union all

  select 'hiragana_reading'::text,
    (select count(*) from public.user_hiragana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_hiragana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'katakana_reading'::text,
    (select count(*) from public.user_katakana_progress where user_id = p_user_id) as seen,
    (select count(*) from public.user_katakana_progress
       where user_id = p_user_id and status in ('review', 'relearning')) as learned,
    (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as total

  union all

  select 'hiragana_' || h.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.hiragana h
  left join public.user_hiragana_progress p
    on p.hiragana_id = h.id and p.user_id = p_user_id
  where h.entry_kind != 'rule' and h.study_enabled
  group by h.kana_type

  union all

  select 'katakana_' || k.kana_type,
    count(*) filter (where p.id is not null) as seen,
    count(*) filter (where p.status in ('review', 'relearning')) as learned,
    count(*) as total
  from public.katakana k
  left join public.user_katakana_progress p
    on p.katakana_id = k.id and p.user_id = p_user_id
  where k.entry_kind != 'rule' and k.study_enabled
  group by k.kana_type;
$function$;
