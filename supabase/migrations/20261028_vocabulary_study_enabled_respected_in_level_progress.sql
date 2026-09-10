-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Follow-up to 20261027_vocabulary_study_enabled_gates_cards_and_kanji_words.sql: that migration
-- stopped a disabled vocabulary row from ever being shown as a card or picked as a kanji's
-- associated word, but left get_level_progress's 'vocabulary'/'kanji_reading' totals and
-- get_new_card_caps' vocab_total counting every vocabulary row regardless of study_enabled --
-- exactly the same gap 20260906_mastery_denominators_respect_study_enabled.sql already fixed for
-- hiragana.study_enabled/katakana.study_enabled. A disabled row can now never gain a
-- user_vocabulary_progress/user_kanji_reading_progress row (get_new_vocab_candidates /
-- rebuild_kanji_detail_words), so leaving it counted in a "seen/learned out of total" denominator
-- means that total is permanently unreachable for any JLPT level with a disabled word -- this
-- would have silently capped /progress and the dashboard's level-progress bars below 100% forever.
--
-- Fix, same shape as before: add `and study_enabled` (or join vocabulary and check it) everywhere
-- one of these totals is derived from vocabulary. 'seen'/'learned' are deliberately left alone,
-- same as the kana fix -- a word a student already progressed on while it was enabled still
-- counts as seen/learned even if it's disabled later; only the denominator shrinks.
--
-- get_level_progress's 'kanji_reading' total counted raw kanji_detail_words rows, which
-- rebuild_kanji_detail_words now never populates with a disabled word -- but that table is only
-- as fresh as the last manual rebuild, so this joins through to vocabulary directly instead of
-- trusting the precomputed table to already be in sync, same read-time defense-in-depth as
-- get_kanji_detail_words/get_kanji_detail_words_batch already got in the prior migration.

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
       join public.kanji_word kw on kw.id = kdw.kanji_word_id
       join public.vocabulary v on v.id = kw.id_word
       where k.level = p_level and v.study_enabled) as total

  union all

  select 'vocabulary'::text,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level) as seen,
    (select count(*) from public.user_vocabulary_progress p
       join public.vocabulary v on v.id = p.word_id
       where p.user_id = p_user_id and v.jlpt_level = p_level
         and p.status in ('review', 'relearning')) as learned,
    (select count(*) from public.vocabulary where jlpt_level = p_level and study_enabled) as total

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

create or replace function public.get_new_card_caps()
returns table(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
language sql
stable
as $function$
  with totals as (
    select
      (select count(*) from public.kanji) as kanji_total,
      (select count(*) from public.vocabulary where study_enabled) as vocab_total,
      (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as hiragana_total,
      (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as katakana_total
  ),
  -- Kanji and vocab are locked at a 1:6 ratio by sync_new_vocab_per_day_trigger -- deriving
  -- vocab_max as kanji_max * 6 (rather than capping each independently against its own table)
  -- means whichever column that trigger computes from the other always lands within its own
  -- table's real size too.
  kanji as (
    select greatest(least(kanji_total, floor(vocab_total::numeric / 6)::integer), 1) as kanji_max
    from totals
  )
  select
    kanji.kanji_max,
    kanji.kanji_max * 6 as vocab_max,
    greatest(floor(totals.hiragana_total::numeric / 5)::integer * 5, 5) as hiragana_max,
    greatest(floor(totals.katakana_total::numeric / 5)::integer * 5, 5) as katakana_max
  from totals, kanji;
$function$;
